// -----------------------------------------------------------------------------
// The integration: one deCONZ gateway, read through its REST API (lights,
// sensors, config) and followed through its WebSocket (events), the Gladys
// devices built from its resources, the states and button events sent to
// Gladys, and the commands sent back. index.js only wires the SDK handlers.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { createRestClient, openSocket } from './api.js';
import { decodeButtonEvent } from './buttons.js';
import { connectionKey, normalizeConfig } from './config.js';
import {
  DEFAULT_WEBSOCKET_PORT,
  DEVICE_TYPE,
  LIMITS,
  SCENE_TRIGGERS,
  TIMINGS,
} from './constants.js';
import { buildModel, deviceReachable, signatureOf } from './devices.js';
import { gatewaysFromSsdp } from './discovery.js';
import { T, failureText } from './i18n.js';
import { applyEvent, parseCollection, reachableOf } from './resources.js';
import { StatePublisher } from './publisher.js';

/** Resources left out on purpose (the gateway itself, its virtual sensors). */
const EXPECTED_SKIP = /virtual|nothing to control/;
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export class DeconzApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'deconz' }),
    restClient = createRestClient,
    connectSocket = openSocket,
    now = Date.now,
    timers = globalThis,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.restClient = restClient;
    this.connectSocket = connectSocket;
    this.now = now;
    this.timers = timers;
    this.raw = {};
    this.config = normalizeConfig();
    this.rest = null;
    this.socket = null;
    this.connected = false;
    this.gateway = null;
    /** resource key ("lights/3") -> resource */
    this.resources = new Map();
    this.model = buildModel(gladys, []);
    /** featureId -> last value read, sent when the user creates the device */
    this.lastValues = new Map();
    this.created = new Set();
    /** deviceId -> transport last published */
    this.transports = new Map();
    /** Timeouts (retry, rebuild, resyncSoon) and intervals (ping, resync). */
    this.timer = {};
    this.retryDelay = TIMINGS.retryMin;
    this.alive = true;
    this.generation = 0;
    this.lastStatus = undefined;
    this.warned = new Set();
    this.sceneEvents = [];
    /** The device list last published (JSON), not sent again while unchanged. */
    this.published = undefined;
    this.publisher = new StatePublisher({ gladys, logger, now, timers });
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    const generation = this.generation;
    this.raw = { ...(raw ?? {}) };
    this.config = normalizeConfig(this.raw);
    this.published = undefined;
    this.refreshCreated();
    this.publisher.start();
    const config = this.config;
    if (config.hostError === 'invalid') {
      await this.setStatus(false, T.badHost);
      return;
    }
    if (!config.host) {
      await this.setStatus(false, T.searching);
      const found = await this.scan().catch(() => []);
      if (generation !== this.generation) {
        return;
      }
      if (found.length !== 1) {
        await this.setStatus(
          false,
          found.length > 1 ? T.severalFound(found.map((g) => g.host).join(', ')) : T.notConfigured,
        );
        return;
      }
      await this.save({ host: found[0].host, port: found[0].port }, false);
      if (generation !== this.generation) {
        return;
      }
    }
    if (!this.config.apiKey) {
      await this.setStatus(false, T.noApiKey(this.config.host));
      return;
    }
    this.rest = this.restClient(this.config);
    await this.setStatus(false, T.connecting(this.config.host));
    await this.connect(generation);
  }

  /**
   * Configuration changed: reconnect only when the connection changed (the
   * values saved by the buttons come back here too).
   */
  async configure(raw = {}) {
    const next = normalizeConfig(raw);
    if (this.rest && connectionKey(next) === connectionKey(this.config)) {
      this.raw = { ...raw };
      return;
    }
    await this.start(raw);
  }

  stop() {
    this.generation += 1;
    for (const name of ['retry', 'rebuild', 'resyncSoon']) {
      this.timers.clearTimeout(this.timer[name]);
    }
    for (const name of ['ping', 'resync']) {
      this.timers.clearInterval(this.timer[name]);
    }
    this.timer = {};
    this.publisher.stop();
    this.closeSocket();
    this.connected = false;
    this.rest = null;
  }

  closeSocket() {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.removeAllListeners?.();
      socket.on?.('error', () => {});
      socket.terminate?.();
    }
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  warnOnce(key, message) {
    if (!this.warned.has(key)) {
      this.warned.add(key);
      this.logger.warn(message);
    }
  }

  /** Saves config values (setConfig), and restarts with them when asked. */
  async save(values, restart) {
    await this.gladys.setConfig(values);
    this.raw = { ...this.raw, ...values };
    if (restart) {
      await this.start(this.raw);
    } else {
      this.config = normalizeConfig(this.raw);
    }
  }

  // --- Connection ------------------------------------------------------------

  /** Reads the gateway config, then opens its WebSocket; retries on failure. */
  async connect(generation) {
    let gateway;
    try {
      gateway = await this.rest.getConfig();
    } catch (err) {
      if (generation === this.generation) {
        await this.failed(err, generation);
      }
      return;
    }
    if (generation !== this.generation) {
      return;
    }
    this.gateway = gateway ?? {};
    const port = Number(this.gateway.websocketport) || DEFAULT_WEBSOCKET_PORT;
    const url = `ws://${this.config.host}:${port}`;
    let socket;
    try {
      socket = this.connectSocket(url);
    } catch (err) {
      await this.failed(err, generation);
      return;
    }
    this.socket = socket;
    const current = () => generation === this.generation && this.socket === socket;
    socket.on('open', () => {
      if (current()) {
        this.onSocketOpen(generation).catch((err) =>
          this.logger.error(`After the WebSocket opened: ${err.message}`),
        );
      }
    });
    socket.on('message', (data) => {
      if (current()) {
        this.onMessage(data);
      }
    });
    socket.on('pong', () => {
      this.alive = true;
    });
    socket.on('error', (err) => {
      if (current()) {
        this.logger.warn(`WebSocket ${url}: ${err.message}`);
      }
    });
    socket.on('close', (code) => {
      if (current()) {
        this.onSocketClosed(generation, `code ${code}`).catch(() => {});
      }
    });
  }

  async failed(err, generation) {
    this.logger.warn(`Gateway ${this.config.host}: ${err.message}`);
    await this.setStatus(false, failureText(err));
    // A refused key needs the user (a new key); anything else is retried.
    if (err?.reason !== 'unauthorized' && generation === this.generation) {
      this.scheduleRetry(generation);
    }
  }

  scheduleRetry(generation) {
    this.timers.clearTimeout(this.timer.retry);
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, TIMINGS.retryMax);
    this.timer.retry = this.timers.setTimeout(() => {
      this.timer.retry = undefined;
      if (generation === this.generation) {
        this.connect(generation).catch((err) => this.logger.error(`Reconnection: ${err.message}`));
      }
    }, delay);
  }

  async onSocketOpen(generation) {
    this.logger.info(`Connected to ${this.config.host} (WebSocket)`);
    this.connected = true;
    this.retryDelay = TIMINGS.retryMin;
    this.alive = true;
    this.timers.clearInterval(this.timer.ping);
    this.timer.ping = this.timers.setInterval(() => this.ping(), TIMINGS.pingInterval);
    this.timers.clearInterval(this.timer.resync);
    this.timer.resync = this.timers.setInterval(() => {
      this.resync().catch((err) => this.logger.warn(`Periodic read failed: ${err.message}`));
    }, TIMINGS.resync);
    try {
      await this.resync();
    } catch (err) {
      if (generation === this.generation) {
        this.logger.warn(`Reading the resources failed: ${err.message}`);
        await this.setStatus(false, failureText(err));
      }
    }
  }

  /** No pong since the last ping: the gateway is gone (power cut, network). */
  ping() {
    const socket = this.socket;
    if (!socket) {
      return;
    }
    if (!this.alive) {
      this.logger.warn('No answer from the gateway WebSocket: reconnecting');
      socket.terminate?.();
      this.onSocketClosed(this.generation, 'timeout').catch(() => {});
      return;
    }
    this.alive = false;
    try {
      socket.ping?.();
    } catch {
      // The close event follows.
    }
  }

  async onSocketClosed(generation, reason) {
    if (generation !== this.generation) {
      return;
    }
    this.closeSocket();
    this.connected = false;
    this.timers.clearInterval(this.timer.ping);
    this.timers.clearInterval(this.timer.resync);
    this.logger.warn(`Gateway WebSocket closed (${reason})`);
    await this.setStatus(false, T.socketLost(reason));
    await this.publishAllTransports();
    this.scheduleRetry(generation);
  }

  // --- Resources -------------------------------------------------------------

  /** Gladys asks for the devices: read the gateway again, publish even if unchanged. */
  scanRequest() {
    return this.rest ? this.resync(true) : this.rebuild(true);
  }

  /** Reads every light and sensor, then rebuilds the devices. */
  async resync(force = false) {
    const generation = this.generation;
    const [lights, sensors] = await Promise.all([this.rest.getLights(), this.rest.getSensors()]);
    if (generation !== this.generation) {
      return;
    }
    this.resources = new Map(
      [...parseCollection('lights', lights), ...parseCollection('sensors', sensors)].map((r) => [
        r.key,
        r,
      ]),
    );
    await this.rebuild(force);
  }

  scheduleResync() {
    if (this.timer.resyncSoon) {
      return;
    }
    const generation = this.generation;
    this.timer.resyncSoon = this.timers.setTimeout(() => {
      this.timer.resyncSoon = undefined;
      if (generation === this.generation) {
        this.resync().catch((err) =>
          this.logger.warn(`Reading the resources failed: ${err.message}`),
        );
      }
    }, TIMINGS.rebuildDebounce);
  }

  scheduleRebuild() {
    this.timers.clearTimeout(this.timer.rebuild);
    const generation = this.generation;
    this.timer.rebuild = this.timers.setTimeout(() => {
      this.timer.rebuild = undefined;
      if (generation === this.generation) {
        this.rebuild().catch((err) =>
          this.logger.error(`Rebuilding the devices failed: ${err.message}`),
        );
      }
    }, TIMINGS.rebuildDebounce);
  }

  async rebuild(force = false) {
    this.model = buildModel(this.gladys, [...this.resources.values()]);
    for (const { key, reason } of this.model.skipped) {
      if (EXPECTED_SKIP.test(reason)) {
        this.logger.debug(`${key} left out: ${reason}`);
      } else {
        this.warnOnce(`skip:${key}:${reason}`, `${key} left out: ${reason}`);
      }
    }
    for (const resource of this.resources.values()) {
      this.readResource(resource);
    }
    const json = JSON.stringify(this.model.devices);
    if (force || json !== this.published) {
      await this.gladys.publishDiscoveredDevices(this.model.devices).then(
        () => {
          this.published = json;
        },
        (err) => this.logger.warn(`Publishing the discovered devices failed: ${err.message}`),
      );
    }
    if (this.connected) {
      await this.setStatus(true, this.statusMessage());
    }
    await this.publishAllTransports();
  }

  statusMessage() {
    const name = this.gateway?.name || this.config.host;
    return T.connected(name, this.model.devices.length);
  }

  readResource(resource) {
    const route = this.model.routes.get(resource.key);
    for (const s of route?.read(resource) ?? []) {
      this.record(s.featureId, s.state);
    }
  }

  /** Keeps the value, and sends it when the device exists in Gladys. */
  record(featureId, state) {
    this.lastValues.set(featureId, state);
    if (this.created.has(featureId)) {
      this.publisher.push(featureId, state);
    }
  }

  onMessage(data) {
    const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
    if (text.length > LIMITS.messageBytes) {
      return;
    }
    let event;
    try {
      event = JSON.parse(text);
    } catch {
      this.warnOnce('ws-json', 'A WebSocket message of the gateway is not JSON: ignored');
      return;
    }
    const result = applyEvent(this.resources, event);
    switch (result.type) {
      case 'added':
      case 'deleted':
        this.scheduleRebuild();
        return;
      case 'unknown':
        // A resource we never read (added while disconnected): read everything again.
        this.scheduleResync();
        return;
      case 'changed':
        this.onChanged(result, event);
        return;
      default:
    }
  }

  onChanged({ key, before, resource }, event) {
    if (signatureOf(resource) !== this.model.signatures.get(key)) {
      this.scheduleRebuild();
    }
    const route = this.model.routes.get(key);
    if (!route) {
      return;
    }
    this.readResource(resource);
    if (route.button && event.state && 'buttonevent' in event.state) {
      this.onButton(route, before, resource);
    }
    if (reachableOf(before) !== reachableOf(resource)) {
      this.publishTransport(route.deviceId).catch((err) =>
        this.logger.warn(`Transport badge failed: ${err.message}`),
      );
    }
  }

  /** A press: the button feature (as an event) and the scene trigger. */
  onButton(route, before, resource) {
    const was = before?.state ?? {};
    const now = resource.state;
    if (
      now.lastupdated !== undefined &&
      now.lastupdated === was.lastupdated &&
      now.buttonevent === was.buttonevent
    ) {
      // The same state sent again (websocketnotifyall): not a new press.
      return;
    }
    const decoded = decodeButtonEvent(now, resource.type);
    if (!decoded) {
      return;
    }
    if (decoded.status !== undefined && this.created.has(route.button)) {
      this.publisher.pushEvent(route.button, decoded.status);
    }
    const t = this.now();
    this.sceneEvents = this.sceneEvents.filter((at) => t - at < 60_000);
    if (this.sceneEvents.length >= LIMITS.eventsPerMinute) {
      this.warnOnce('events-budget', 'Too many button events this minute: some are dropped');
      return;
    }
    this.sceneEvents.push(t);
    this.gladys
      .publishSceneEvent(SCENE_TRIGGERS.BUTTON, {
        device: route.deviceId,
        button: decoded.button,
        event: decoded.event,
        code: decoded.code,
        gesture: finite(now.gesture),
      })
      .catch((err) => this.logger.warn(`Scene event failed: ${err.message}`));
  }

  // --- Transport badges --------------------------------------------------------

  transportOf(deviceId) {
    return this.connected && deviceReachable(this.model.members.get(deviceId), this.resources)
      ? DEVICE_TRANSPORTS.LOCAL
      : DEVICE_TRANSPORTS.UNREACHABLE;
  }

  async publishTransport(deviceId) {
    if (!this.createdDevices().has(deviceId)) {
      return;
    }
    const transport = this.transportOf(deviceId);
    if (this.transports.get(deviceId) === transport) {
      return;
    }
    this.transports.set(deviceId, transport);
    await this.gladys.publishTransports([{ external_id: deviceId, transport }]);
  }

  async publishAllTransports() {
    const entries = [];
    for (const deviceId of this.createdDevices()) {
      if (!this.model.members.has(deviceId)) {
        continue;
      }
      const transport = this.transportOf(deviceId);
      if (this.transports.get(deviceId) !== transport) {
        this.transports.set(deviceId, transport);
        entries.push({ external_id: deviceId, transport });
      }
    }
    for (let i = 0; i < entries.length; i += 100) {
      await this.gladys
        .publishTransports(entries.slice(i, i + 100))
        .catch((err) => this.logger.warn(`Transport badges failed: ${err.message}`));
    }
  }

  // --- Devices created by the user ---------------------------------------------

  createdDevices() {
    return new Set((this.gladys.devices ?? []).map((d) => d.external_id));
  }

  refreshCreated() {
    this.created = new Set(
      (this.gladys.devices ?? []).flatMap((d) => (d.features ?? []).map((f) => f.external_id)),
    );
  }

  async deviceCreated(device) {
    this.refreshCreated();
    this.transports.delete(device?.external_id);
    for (const f of device?.features ?? []) {
      if (this.lastValues.has(f.external_id)) {
        this.publisher.push(f.external_id, this.lastValues.get(f.external_id));
      }
    }
    if (device?.external_id) {
      await this.publishTransport(device.external_id).catch(() => {});
    }
  }

  async deviceDeleted(device) {
    this.refreshCreated();
    if (device?.external_id) {
      this.transports.delete(device.external_id);
      this.publisher.forget(device.external_id);
    }
  }

  // --- Commands --------------------------------------------------------------

  async setValue(device, feature, value) {
    const writer = this.model.writers.get(feature.external_id);
    if (!writer) {
      throw new Error(`${feature.name ?? feature.external_id} cannot be controlled`);
    }
    const resource = this.resources.get(writer.resourceKey);
    if (!this.rest || !resource) {
      throw new Error('the deCONZ gateway is not connected');
    }
    const { path, body } = writer.write(value, resource);
    await this.rest.put(path, body);
    this.logger.debug(`PUT ${path} ${JSON.stringify(body)}`);
  }

  // --- Configuration screen buttons ------------------------------------------

  /** SSDP scan through the Gladys core -> the deCONZ gateways. */
  async scan() {
    const results = await this.gladys.scanNetwork('ssdp', { timeoutSeconds: TIMINGS.scanSeconds });
    return gatewaysFromSsdp(results);
  }

  async findGateway() {
    let found;
    try {
      found = await this.scan();
    } catch (err) {
      return T.find.unavailable(err.message);
    }
    if (found.length === 0) {
      return T.find.none;
    }
    if (found.length > 1) {
      return T.severalFound(found.map((g) => `${g.host}:${g.port}`).join(', '));
    }
    const [gateway] = found;
    const label = `${gateway.host}:${gateway.port}`;
    if (gateway.host === this.config.host && gateway.port === this.config.port) {
      return T.find.same(label);
    }
    await this.save({ host: gateway.host, port: gateway.port }, true);
    return T.find.saved(label);
  }

  /** POST /api: works within 60 s after "Authenticate app" in Phoscon. */
  async getApiKey() {
    if (!this.config.host) {
      return T.apiKey.noHost;
    }
    let key;
    try {
      key = await this.restClient(this.config).createApiKey(DEVICE_TYPE);
    } catch (err) {
      return err?.reason === 'locked' || err?.reason === 'unauthorized'
        ? T.apiKey.locked
        : failureText(err);
    }
    await this.save({ api_key: key }, true);
    return T.apiKey.ok;
  }

  /** Reads the gateway config, lights and sensors with the saved configuration. */
  async testConnection() {
    const config = this.config;
    if (!config.host) {
      return config.hostError === 'invalid' ? T.badHost : T.notConfigured;
    }
    if (!config.apiKey) {
      return T.noApiKey(config.host);
    }
    const rest = this.restClient(config);
    try {
      const [gateway, lights, sensors] = await Promise.all([
        rest.getConfig(),
        rest.getLights(),
        rest.getSensors(),
      ]);
      const resources = [
        ...parseCollection('lights', lights),
        ...parseCollection('sensors', sensors),
      ];
      const model = buildModel(this.gladys, resources);
      const ok = T.test.ok(
        gateway?.name || config.host,
        gateway?.swversion,
        model.devices.length,
        resources.filter((r) => r.kind === 'lights').length,
        resources.filter((r) => r.kind === 'sensors').length,
      );
      const unsupported = model.skipped.filter((s) => !EXPECTED_SKIP.test(s.reason));
      if (unsupported.length === 0) {
        return ok;
      }
      for (const { key, reason } of unsupported) {
        this.logger.warn(`${key}: ${reason}`);
      }
      const extra = T.test.unsupported(unsupported.length);
      return { en: ok.en + extra.en, fr: ok.fr + extra.fr };
    } catch (err) {
      return failureText(err);
    }
  }
}
