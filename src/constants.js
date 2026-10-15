// -----------------------------------------------------------------------------
// Keys shared with the manifest (frozen: users store them in their scenes and
// configuration) and the tuning of the integration.
// -----------------------------------------------------------------------------

/** Manifest `actions` keys. */
export const ACTIONS = {
  FIND: 'find_gateway',
  API_KEY: 'get_api_key',
  TEST: 'test_connection',
};

/** Manifest `scene_triggers` keys. */
export const SCENE_TRIGGERS = {
  BUTTON: 'button_event',
};

/** The SSDP search target of the manifest `network_discovery` entry. */
export const SSDP_ST = 'urn:schemas-upnp-org:device:basic:1';

/** The `devicetype` deCONZ stores next to the API key (Phoscon shows it). */
export const DEVICE_TYPE = 'gladys-deconz';

export const DEFAULT_PORT = 80;
/** deCONZ's own default when /config does not say. */
export const DEFAULT_WEBSOCKET_PORT = 443;

export const LIMITS = {
  /** Gladys accepts 300 states per minute: keep a margin for the other paths. */
  statesPerMinute: 250,
  /** Gladys accepts 300 scene events per minute. */
  eventsPerMinute: 250,
  /** REST answers and WebSocket messages read (bytes). */
  responseBytes: 8 * 1024 * 1024,
  messageBytes: 256 * 1024,
  /** Scene event strings. */
  eventText: 1000,
};

export const TIMINGS = {
  /** REST request timeout. */
  requestTimeout: 10_000,
  /** WebSocket opening timeout. */
  socketTimeout: 10_000,
  /** A ping is sent this often; no pong before the next one closes the socket. */
  pingInterval: 30_000,
  /** Reconnection delays: first, then doubled up to the max. */
  retryMin: 5000,
  retryMax: 60_000,
  /** Added/removed/renamed resources arrive in bursts: wait for the burst to end. */
  rebuildDebounce: 1500,
  /** A full REST read, in case the WebSocket missed an event. */
  resync: 10 * 60_000,
  /** The pending states are sent at this pace. */
  flushInterval: 1000,
  /** An unchanged value is re-sent this often, so it stays recently dated in Gladys. */
  stateHeartbeat: 30 * 60_000,
  /** SSDP scan duration (s). */
  scanSeconds: 5,
};
