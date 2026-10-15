// A fake deCONZ gateway: the REST client the app creates (same methods as
// src/api.js createRestClient) and its WebSocket (the events of the `ws`
// client). No network.

import { EventEmitter } from 'node:events';
import { DeconzError } from '../../src/api.js';
import { API_KEY, CONFIG, LIGHTS, SENSORS } from '../fixtures/gateway.js';

const copy = (value) => structuredClone(value);

export class FakeSocket extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.pings = 0;
    this.terminated = false;
  }

  ping() {
    this.pings += 1;
  }

  terminate() {
    this.terminated = true;
  }

  // --- The gateway side ---
  open() {
    this.emit('open');
  }

  send(event) {
    this.emit('message', Buffer.from(typeof event === 'string' ? event : JSON.stringify(event)));
  }

  pong() {
    this.emit('pong');
  }

  close(code = 1006) {
    this.emit('close', code);
  }
}

/**
 * The gateway: its data, the clients and sockets the app created, the
 * commands received. `failure` makes every request fail with that error;
 * `locked` refuses the API key requests.
 */
export function fakeGateway({ lights = LIGHTS, sensors = SENSORS, config = CONFIG } = {}) {
  const gateway = {
    data: { lights: copy(lights), sensors: copy(sensors), config: copy(config) },
    clients: [],
    sockets: [],
    puts: [],
    failure: null,
    locked: false,
    keys: [API_KEY],
  };

  const check = (client) => {
    if (gateway.failure) {
      throw gateway.failure;
    }
    if (!gateway.keys.includes(client.config.apiKey)) {
      throw new DeconzError('deCONZ: unauthorized user', {
        reason: 'unauthorized',
        status: 403,
        type: 1,
      });
    }
  };

  gateway.restClient = (config) => {
    const client = {
      config: { ...config },
      async createApiKey(devicetype) {
        if (gateway.failure) {
          throw gateway.failure;
        }
        if (gateway.locked) {
          throw new DeconzError('deCONZ: link button not pressed', {
            reason: 'locked',
            status: 403,
            type: 101,
          });
        }
        client.devicetype = devicetype;
        const key = `KEY${gateway.keys.length}ABCDEF`;
        gateway.keys.push(key);
        return key;
      },
      async getConfig() {
        check(client);
        return copy(gateway.data.config);
      },
      async getLights() {
        check(client);
        return copy(gateway.data.lights);
      },
      async getSensors() {
        check(client);
        return copy(gateway.data.sensors);
      },
      async put(path, body) {
        check(client);
        gateway.puts.push({ path, body });
        return Object.entries(body).map(([k, v]) => ({ success: { [`${path}/${k}`]: v } }));
      },
    };
    gateway.clients.push(client);
    return client;
  };

  gateway.connectSocket = (url) => {
    const socket = new FakeSocket(url);
    gateway.sockets.push(socket);
    return socket;
  };

  /** The last socket the app opened. */
  gateway.socket = () => gateway.sockets.at(-1);

  return gateway;
}

/** Lets the pending promises run (the app chains a few awaits per event). */
export async function settle(rounds = 10) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}
