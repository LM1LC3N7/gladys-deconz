// -----------------------------------------------------------------------------
// The configuration of the manifest `config_schema`, normalized.
// -----------------------------------------------------------------------------

import { DEFAULT_PORT } from './constants.js';

/** Defaults, mirrored by the manifest (checked by test/manifest.test.js). */
export const DEFAULTS = {
  host: '',
  port: DEFAULT_PORT,
  api_key: '',
};

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * The gateway address typed by the user: "192.168.1.20", "phoscon.lan",
 * "http://192.168.1.20:8080/" or "192.168.1.20:8080" (the port then wins over
 * the port field).
 * @returns {{ host: string, port?: number } | { error: 'empty' | 'invalid' }}
 */
export function parseHost(raw) {
  let text = String(raw ?? '').trim();
  if (text === '') {
    return { error: 'empty' };
  }
  if (!/^[a-z]+:\/\//i.test(text)) {
    text = `http://${text}`;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'invalid' };
  }
  const host = url.hostname;
  if (url.protocol !== 'http:' || url.username || url.password) {
    return { error: 'invalid' };
  }
  const ipv4 = IPV4.test(host) && host.split('.').every((n) => Number(n) <= 255);
  if (!ipv4 && (!HOST.test(host) || /^[\d.]+$/.test(host))) {
    return { error: 'invalid' };
  }
  return url.port ? { host, port: Number(url.port) } : { host };
}

const validPort = (n) => Number.isInteger(n) && n >= 1 && n <= 65535;

export function normalizeConfig(raw = {}) {
  const given = Object.fromEntries(
    Object.entries(raw ?? {}).filter(([, v]) => v !== null && v !== undefined),
  );
  const c = { ...DEFAULTS, ...given };
  const parsed = parseHost(c.host);
  const port = Number(c.port);
  return {
    host: parsed.host,
    hostError: parsed.error,
    port: parsed.port ?? (validPort(port) ? port : DEFAULT_PORT),
    apiKey: String(c.api_key ?? '').trim(),
  };
}

/** What identifies a connection: a change of any of these reconnects. */
export const connectionKey = (config) =>
  JSON.stringify([config.host ?? null, config.port, config.apiKey]);
