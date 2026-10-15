// -----------------------------------------------------------------------------
// End to end: the real SDK wiring (src/handlers.js) against the SDK's fake
// Gladys, and a fake deCONZ gateway (REST + WebSocket). Timers are mocked: the
// rebuild debounce, the retries, the pings and the state flush run when the
// test ticks.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { DeconzError } from '../src/api.js';
import { DeconzApp } from '../src/app.js';
import { BUTTON_STATUS } from '../src/buttons.js';
import { ACTIONS, DEVICE_TYPE, SCENE_TRIGGERS, TIMINGS } from '../src/constants.js';
import { registerHandlers } from '../src/handlers.js';
import { COVER_STATE, THERMOSTAT_MODE } from '../src/mapping.js';
import {
  API_KEY,
  HOST,
  LIGHTS,
  SENSORS,
  SSDP_DECONZ,
  SSDP_HUE,
  deviceId,
  event,
  featureId,
} from './fixtures/gateway.js';
import { fakeGateway, settle } from './helpers/fakeDeconz.js';

const CONFIGURED = { host: HOST, port: 80, api_key: API_KEY };
const SALON = LIGHTS[2].uniqueid;
const HUE_DIMMER = SENSORS[15].uniqueid;
const WEATHER = SENSORS[2].uniqueid;

async function setup(t, { config = CONFIGURED, gateway = fakeGateway(), scanResults } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_760_000_000_000 });
  const gladys = createFakeGladys({ config: { ...config }, scanResults });
  const app = new DeconzApp({
    gladys,
    logger: createLogger({ level: 'silent' }),
    restClient: gateway.restClient,
    connectSocket: gateway.connectSocket,
    now: () => Date.now(),
  });
  registerHandlers(gladys, app);
  await gladys.connect();
  t.after(() => app.stop());
  const tick = async (ms) => {
    t.mock.timers.tick(ms);
    await settle();
  };
  return { gladys, app, gateway, tick };
}

/** Opens the WebSocket of the gateway: the app reads the resources. */
async function open(ctx) {
  ctx.gateway.socket().open();
  await settle();
}

const device = (gladys, uniqueid) =>
  gladys.fake.discoveredDevices.find((d) => d.external_id === deviceId(uniqueid));

async function create(ctx, uniqueid) {
  const d = device(ctx.gladys, uniqueid);
  await ctx.gladys.fake.deviceCreated(d);
  return d;
}

test('the gateway is read, its devices published, the states sent once created', async (t) => {
  const ctx = await setup(t);
  const { gladys, gateway } = ctx;
  assert.equal(gateway.clients[0].config.host, HOST);
  assert.equal(gateway.socket().url, `ws://${HOST}:8081`, 'the WebSocket port of /config');
  await open(ctx);
  const names = gladys.fake.discoveredDevices.map((d) => d.name);
  assert.deepEqual(names, [
    'Compteur maison',
    'Couloir',
    'Cube',
    'Détecteur CO',
    'Détecteur fumée',
    'Fuite cuisine',
    'Météo bureau',
    'Mouvement couloir',
    'Porte entrée',
    'Prise lave-linge',
    'Radiateur salon',
    'Relais cuisine',
    'Ruban LED',
    'Salon',
    'Télécommande IKEA',
    'Variateur Hue',
    'Vibration fenêtre',
    'Volet chambre',
  ]);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.en, /Connected to Phoscon-GW: 18 devices/);

  // Nothing is sent before the user creates the device; its values are kept.
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.states.length, 0);
  await create(ctx, WEATHER);
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.lastState(featureId(WEATHER, 'temperature')), 21.54);
  assert.equal(gladys.fake.lastState(featureId(SENSORS[3].uniqueid, 'humidity')), 48.75);
  assert.equal(gladys.fake.lastState(`${deviceId(WEATHER)}:battery`), 95);

  // A WebSocket event updates the state.
  gateway
    .socket()
    .send(event('changed', 'sensors', 2, { uniqueid: WEATHER, state: { temperature: 2201 } }));
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.lastState(featureId(WEATHER, 'temperature')), 22.01);
  gateway.socket().send(event('changed', 'sensors', 3, { config: { battery: 94 } }));
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.lastState(`${deviceId(WEATHER)}:battery`), 94);
});

test('commands are sent to the REST API', async (t) => {
  const ctx = await setup(t);
  const { gladys, gateway } = ctx;
  await open(ctx);
  const send = async (uniqueid, key, value) => {
    const d = device(gladys, uniqueid);
    const f = d.features.find((x) => x.external_id === featureId(uniqueid, key));
    assert.ok(f, `${key} of ${d.name}`);
    const ack = await gladys.fake.setValue(d, f, value);
    assert.equal(ack.success, true, ack.error);
    return gateway.puts.at(-1);
  };
  assert.deepEqual(await send(SALON, 'on', 0), { path: '/lights/2/state', body: { on: false } });
  assert.deepEqual(await send(SALON, 'bri', 128), {
    path: '/lights/2/state',
    body: { on: true, bri: 128 },
  });
  assert.deepEqual(await send(SALON, 'ct', 250), {
    path: '/lights/2/state',
    body: { on: true, ct: 250 },
  });
  const red = await send(SALON, 'color', 0xff0000);
  assert.deepEqual(red.body, { on: true, xy: [0.7006, 0.2993] });
  const green = await send(LIGHTS[8].uniqueid, 'color', 0x00ff00);
  assert.deepEqual(green, {
    path: '/lights/8/state',
    body: { on: true, hue: 21845, sat: 255 },
  });
  const cover = LIGHTS[5].uniqueid;
  assert.deepEqual((await send(cover, 'position', 100)).body, { lift: 0 }, '100 % = open');
  assert.deepEqual((await send(cover, 'state', COVER_STATE.CLOSE)).body, { open: false });
  assert.deepEqual((await send(cover, 'state', COVER_STATE.STOP)).body, { stop: true });
  assert.deepEqual(await send(LIGHTS[4].uniqueid, 'on', 1), {
    path: '/lights/4/state',
    body: { on: true },
  });
  const thermostat = SENSORS[14].uniqueid;
  assert.deepEqual(await send(thermostat, 'heatsetpoint', 21.5), {
    path: '/sensors/14/config',
    body: { heatsetpoint: 2150 },
  });
  assert.deepEqual((await send(thermostat, 'mode', THERMOSTAT_MODE.HEATING)).body, {
    mode: 'heat',
  });

  // A sensor cannot be controlled; a gateway error is the command's error.
  const weather = device(gladys, WEATHER);
  const refused = await gladys.fake.setValue(weather, weather.features[0], 1);
  assert.equal(refused.success, false);
  gateway.failure = new DeconzError('deCONZ: resource, /lights/2/state, not available', {
    reason: 'refused',
  });
  const salon = device(gladys, SALON);
  const failed = await gladys.fake.setValue(salon, salon.features[0], 1);
  assert.equal(failed.success, false);
  assert.match(failed.error, /not available/);
});

test('a remote fires the scene trigger and its button feature, once per press', async (t) => {
  const ctx = await setup(t);
  const { gladys, gateway } = ctx;
  await open(ctx);
  const dimmer = await create(ctx, HUE_DIMMER);
  const button = featureId(HUE_DIMMER, 'buttonevent');
  const press = (code, lastupdated) =>
    gateway
      .socket()
      .send(event('changed', 'sensors', 15, { state: { buttonevent: code, lastupdated } }));
  press(4002, '2026-10-15T09:00:00.000');
  await ctx.tick(TIMINGS.flushInterval);
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: SCENE_TRIGGERS.BUTTON,
    data: {
      device: dimmer.external_id,
      button: 4,
      event: 'short_release',
      code: 4002,
      gesture: null,
    },
  });
  assert.equal(gladys.fake.lastState(button), BUTTON_STATUS.SHORT_RELEASE);

  // The same press again is a new event: sent again, never deduplicated.
  press(4002, '2026-10-15T09:00:02.000');
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.sceneEvents.length, 2);
  assert.equal(gladys.fake.states.filter((s) => s.device_feature_external_id === button).length, 2);

  // The same state sent again (same lastupdated) is not a press.
  press(4002, '2026-10-15T09:00:02.000');
  gateway.socket().send(event('changed', 'sensors', 15, { config: { battery: 99 } }));
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.sceneEvents.length, 2);

  press(1001, '2026-10-15T09:00:05.000');
  await ctx.tick(TIMINGS.flushInterval);
  assert.equal(gladys.fake.lastState(button), BUTTON_STATUS.LONG_PRESS);
  assert.equal(gladys.fake.sceneEvents.at(-1).data.event, 'hold');
});

test('the Aqara cube says its gesture', async (t) => {
  const ctx = await setup(t);
  const { gladys, gateway } = ctx;
  await open(ctx);
  const cube = SENSORS[21].uniqueid;
  await create(ctx, cube);
  gateway.socket().send(
    event('changed', 'sensors', 21, {
      state: { buttonevent: -4523, gesture: 8, lastupdated: '2026-10-15T09:01:00.000' },
    }),
  );
  await ctx.tick(TIMINGS.flushInterval);
  assert.deepEqual(gladys.fake.sceneEvents.at(-1).data, {
    device: deviceId(cube),
    button: null,
    event: 'rotate_ccw',
    code: -4523,
    gesture: 8,
  });
  assert.equal(gladys.fake.lastState(featureId(cube, 'buttonevent')), BUTTON_STATUS.ROTATE_LEFT);
});

test('reachability and the WebSocket drive the transport badges, then it reconnects', async (t) => {
  const ctx = await setup(t);
  const { gladys, gateway } = ctx;
  await open(ctx);
  const salon = await create(ctx, SALON);
  const badge = (transport) => ({ device_external_id: salon.external_id, transport });
  assert.deepEqual(gladys.fake.transports.at(-1), badge(DEVICE_TRANSPORTS.LOCAL));
  gateway.socket().send(event('changed', 'lights', 2, { state: { reachable: false } }));
  await settle();
  assert.deepEqual(gladys.fake.transports.at(-1), badge(DEVICE_TRANSPORTS.UNREACHABLE));
  gateway.socket().send(event('changed', 'lights', 2, { state: { reachable: true } }));
  await settle();
  assert.deepEqual(gladys.fake.transports.at(-1), badge(DEVICE_TRANSPORTS.LOCAL));

  gateway.socket().close();
  await settle();
  assert.deepEqual(gladys.fake.transports.at(-1), badge(DEVICE_TRANSPORTS.UNREACHABLE));
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /WebSocket/);
  assert.equal(gateway.sockets.length, 1);
  await ctx.tick(TIMINGS.retryMin);
  assert.equal(gateway.sockets.length, 2, 'reconnected after the retry delay');
  await open(ctx);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(gladys.fake.transports.at(-1), badge(DEVICE_TRANSPORTS.LOCAL));
});

test('a gateway that stops answering the pings is reconnected', async (t) => {
  const ctx = await setup(t);
  const { gateway } = ctx;
  await open(ctx);
  const first = gateway.socket();
  await ctx.tick(TIMINGS.pingInterval);
  assert.equal(first.pings, 1);
  first.pong();
  await ctx.tick(TIMINGS.pingInterval);
  assert.equal(first.pings, 2, 'answered: pinged again');
  await ctx.tick(TIMINGS.pingInterval);
  assert.equal(first.terminated, true, 'no pong: closed');
  await ctx.tick(TIMINGS.retryMin);
  assert.equal(gateway.sockets.length, 2);
});

test('resources added, renamed or deleted rebuild the devices', async (t) => {
  const ctx = await setup(t);
  const { gladys, gateway } = ctx;
  await open(ctx);
  const count = gladys.fake.discoveredDevices.length;
  gateway.socket().send(
    event('added', 'sensors', 30, {
      sensor: {
        name: 'Porte garage',
        type: 'ZHAOpenClose',
        uniqueid: '00:15:8d:00:0a:0b:0c:0d-01-0006',
        state: { open: true },
        config: { reachable: true, battery: 100 },
      },
    }),
  );
  gateway.socket().send(event('changed', 'lights', 3, { attr: { name: 'Entrée' } }));
  gateway.socket().send(event('deleted', 'lights', 8));
  await ctx.tick(TIMINGS.rebuildDebounce);
  const names = gladys.fake.discoveredDevices.map((d) => d.name);
  assert.equal(names.length, count);
  assert.ok(names.includes('Porte garage'));
  assert.ok(names.includes('Entrée') && !names.includes('Couloir'));
  assert.ok(!names.includes('Ruban LED'));

  // An event of a resource never read: everything is read again.
  gateway.data.sensors[31] = {
    name: 'Fuite salle de bain',
    type: 'ZHAWater',
    uniqueid: '00:15:8d:00:0e:0e:0e:0e-01-0500',
    state: { water: false },
    config: { reachable: true },
  };
  gateway.socket().send(event('changed', 'sensors', 31, { state: { water: true } }));
  await ctx.tick(TIMINGS.rebuildDebounce);
  assert.ok(gladys.fake.discoveredDevices.some((d) => d.name === 'Fuite salle de bain'));

  // The periodic read publishes nothing new; a scan request from Gladys always does.
  const publications = () =>
    gladys.fake.requests.filter((r) => r.path === '/discovered_device').length;
  const before = publications();
  await ctx.tick(TIMINGS.resync);
  assert.equal(publications(), before);
  await gladys.fake.scanRequest();
  assert.equal(publications(), before + 1);
});

test('no address: the gateway is looked for on the network', async (t) => {
  const ctx = await setup(t, {
    config: { api_key: API_KEY },
    scanResults: { ssdp: [SSDP_HUE, SSDP_DECONZ] },
  });
  const { gladys, gateway } = ctx;
  assert.deepEqual(gladys.fake.scans.at(-1), { type: 'ssdp', timeout_seconds: 5 });
  assert.equal(gladys.fake.config.host, HOST, 'the gateway found is saved');
  assert.equal(gladys.fake.config.port, 80);
  assert.equal(gateway.socket().url, `ws://${HOST}:8081`);
});

test('no address and nothing found: the status says what to type', async (t) => {
  const { gladys, gateway } = await setup(t, { config: {} });
  assert.equal(gateway.clients.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /adresse de votre passerelle deCONZ/);
  const answer = await gladys.fake.action(ACTIONS.FIND, {});
  assert.match(answer.data.message.en, /No deCONZ gateway answered/);
});

test('"Find the gateway" saves the gateway found and connects', async (t) => {
  const ctx = await setup(t, { config: { host: '192.168.1.99', api_key: API_KEY } });
  const { gladys, gateway } = ctx;
  gladys.fake.scanResults.ssdp = [SSDP_DECONZ];
  const answer = await gladys.fake.action(ACTIONS.FIND, {});
  assert.match(answer.data.message.fr, /Passerelle trouvée à l'adresse 192\.168\.1\.20:80/);
  assert.equal(gladys.fake.config.host, HOST);
  assert.equal(gateway.socket().url, `ws://${HOST}:8081`);
  const again = await gladys.fake.action(ACTIONS.FIND, {});
  assert.match(again.data.message.en, /it is the one configured/);
});

test('the API key: locked gateway, then unlocked', async (t) => {
  const gateway = fakeGateway();
  gateway.locked = true;
  const ctx = await setup(t, { config: { host: HOST }, gateway });
  const { gladys } = ctx;
  assert.match(gladys.fake.connectionStatus.message.en, /Authenticate app/);
  assert.equal(gateway.sockets.length, 0);

  const locked = await gladys.fake.action(ACTIONS.API_KEY, {});
  assert.match(locked.data.message.en, /The gateway is locked/);
  assert.equal(gladys.fake.config.api_key, undefined);

  gateway.locked = false;
  const ok = await gladys.fake.action(ACTIONS.API_KEY, {});
  assert.match(ok.data.message.en, /API key received and saved/);
  assert.equal(gateway.clients.find((c) => c.devicetype).devicetype, DEVICE_TYPE);
  assert.equal(gladys.fake.config.api_key, 'KEY1ABCDEF');
  await open(ctx);
  assert.equal(gladys.fake.connectionStatus.connected, true);

  // The saved key comes back through onConfigUpdated: no second connection.
  await gladys.fake.configUpdated({ ...gladys.fake.config });
  assert.equal(gateway.sockets.length, 1);
});

test('a refused API key stops and says so; an unreachable gateway is retried', async (t) => {
  const ctx = await setup(t, { config: { ...CONFIGURED, api_key: 'DELETEDKEY' } });
  const { gladys, gateway } = ctx;
  assert.match(gladys.fake.connectionStatus.message.en, /refused the API key/);
  await ctx.tick(TIMINGS.retryMax);
  assert.equal(gateway.sockets.length, 0, 'no retry: the user must get a new key');

  gateway.failure = new DeconzError('ECONNREFUSED', { reason: 'unreachable' });
  await gladys.fake.configUpdated(CONFIGURED);
  assert.match(gladys.fake.connectionStatus.message.fr, /injoignable \(ECONNREFUSED\)/);
  const attempts = () => gateway.clients.length;
  const before = attempts();
  await ctx.tick(TIMINGS.retryMin);
  assert.equal(attempts(), before, 'the same client is used again');
  gateway.failure = null;
  await ctx.tick(TIMINGS.retryMin * 2);
  assert.equal(gateway.sockets.length, 1, 'connected once the gateway answers');
});

test('"Test the connection" sums up the gateway', async (t) => {
  const { gladys } = await setup(t);
  const answer = await gladys.fake.action(ACTIONS.TEST, {});
  assert.equal(answer.success, true);
  assert.equal(
    answer.data.message.en,
    'Connection OK: Phoscon-GW (deCONZ 2.28.1), 18 devices (9 lights, 22 sensors). 2 resources are not supported yet (see the logs).',
  );
});

test('an invalid address is refused without connecting', async (t) => {
  const { gladys, gateway } = await setup(t, { config: { host: 'http://user:pw@host' } });
  assert.equal(gateway.clients.length, 0);
  assert.match(gladys.fake.connectionStatus.message.en, /not valid/);
});
