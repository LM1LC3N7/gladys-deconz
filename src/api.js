// -----------------------------------------------------------------------------
// The only network access: the deCONZ REST API (fetch) and its WebSocket (ws).
// Plain HTTP and WS on the LAN, as deCONZ serves them; unicast to the gateway
// crosses the bridge network of the container.
// -----------------------------------------------------------------------------

import WebSocket from 'ws';
import { LIMITS, TIMINGS } from './constants.js';

/** deCONZ error types (REST API documentation, "Errors"). */
export const ERROR_TYPES = {
  UNAUTHORIZED: 1,
  LINK_BUTTON: 101,
};

export class DeconzError extends Error {
  /**
   * @param {string} message
   * @param {{ reason: 'unreachable' | 'unauthorized' | 'locked' | 'refused' | 'invalid',
   *   status?: number, type?: number }} details
   */
  constructor(message, { reason, status, type }) {
    super(message);
    this.name = 'DeconzError';
    this.reason = reason;
    this.status = status;
    this.type = type;
  }
}

/** The first deCONZ error of an answer ([{ error: { type, address, description } }]). */
export function apiErrorOf(body) {
  const entry = Array.isArray(body) ? body.find((e) => e?.error) : undefined;
  return entry?.error;
}

const reasonOfType = (type) =>
  type === ERROR_TYPES.UNAUTHORIZED
    ? 'unauthorized'
    : type === ERROR_TYPES.LINK_BUTTON
      ? 'locked'
      : 'refused';

/** A network error, explained in a few words (never with the API key). */
export function networkReason(err) {
  const code = err?.cause?.code ?? err?.code;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return 'timeout';
  }
  return code ? String(code) : 'network error';
}

/**
 * A REST client of one gateway.
 * @param {{ host: string, port: number, apiKey?: string }} config
 * @param {{ fetch?: typeof fetch, timeout?: number }} [options]
 */
export function createRestClient(config, { fetch = globalThis.fetch, timeout } = {}) {
  const base = `http://${config.host}:${config.port}/api`;

  async function request(method, path, body) {
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout ?? TIMINGS.requestTimeout),
        redirect: 'error',
      });
    } catch (err) {
      throw new DeconzError(networkReason(err), { reason: 'unreachable' });
    }
    const text = await response.text();
    if (text.length > LIMITS.responseBytes) {
      throw new DeconzError('answer too large', { reason: 'invalid', status: response.status });
    }
    let json;
    try {
      json = text === '' ? null : JSON.parse(text);
    } catch {
      throw new DeconzError(`not a deCONZ answer (HTTP ${response.status})`, {
        reason: 'invalid',
        status: response.status,
      });
    }
    const error = apiErrorOf(json);
    if (error || !response.ok) {
      const type = Number(error?.type);
      throw new DeconzError(
        error?.description
          ? `deCONZ: ${String(error.description).slice(0, 200)}`
          : `HTTP ${response.status}`,
        { reason: reasonOfType(type), status: response.status, type },
      );
    }
    return json;
  }

  const authed = (path) => `/${encodeURIComponent(config.apiKey ?? '')}${path}`;

  return {
    /** Asks for an API key: works within 60 s after "Authenticate app" in Phoscon. */
    async createApiKey(devicetype) {
      const body = await request('POST', '', { devicetype });
      const username = Array.isArray(body) ? body.find((e) => e?.success)?.success?.username : null;
      if (typeof username !== 'string' || username === '') {
        throw new DeconzError('no API key in the answer', { reason: 'invalid' });
      }
      return username;
    },
    getConfig: () => request('GET', authed('/config')),
    getLights: () => request('GET', authed('/lights')),
    getSensors: () => request('GET', authed('/sensors')),
    /** PUT a command; resolves with the `success` entries. */
    put: (path, body) => request('PUT', authed(path), body),
  };
}

/** Opens the WebSocket of the gateway (events only, no authentication). */
export function openSocket(url) {
  return new WebSocket(url, {
    handshakeTimeout: TIMINGS.socketTimeout,
    maxPayload: LIMITS.messageBytes,
    perMessageDeflate: false,
  });
}
