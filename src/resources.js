// -----------------------------------------------------------------------------
// The resources of the deCONZ REST API (pure).
//
// GET /lights and GET /sensors answer { "<id>": { name, type, uniqueid, state,
// config, ... } }. One physical Zigbee device is often several resources (a
// Xiaomi weather sensor = ZHATemperature + ZHAHumidity + ZHAPressure, a plug =
// a light + ZHAPower + ZHAConsumption): they share the IEEE address at the
// start of their `uniqueid` ("00:15:8d:00:02:34:56:78-01-0402"), which groups
// them into one Gladys device. The WebSocket events update these resources.
// -----------------------------------------------------------------------------

/** The REST collections followed (the WebSocket `r` field). */
export const KINDS = ['lights', 'sensors'];

const UNIQUE_ID = /^((?:[0-9a-f]{2}:){7}[0-9a-f]{2})(?:-([0-9a-z-]+))?$/i;

/**
 * "00:15:8d:00:02:34:56:78-01-0402" -> { mac: '00158d0002345678', suffix: '01-0402' }.
 * @returns {{ mac: string, suffix: string } | undefined}
 */
export function parseUniqueId(uniqueid) {
  const match = typeof uniqueid === 'string' ? UNIQUE_ID.exec(uniqueid.trim()) : null;
  if (!match) {
    return undefined;
  }
  return {
    mac: match[1].replace(/:/g, '').toLowerCase(),
    suffix: (match[2] ?? '').toLowerCase(),
  };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** One REST entry -> a resource, or undefined when it has no usable shape. */
export function toResource(kind, id, raw) {
  if (!KINDS.includes(kind) || !isObject(raw)) {
    return undefined;
  }
  const parsed = parseUniqueId(raw.uniqueid);
  return {
    ...raw,
    kind,
    id: String(id),
    key: `${kind}/${id}`,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `${kind} ${id}`,
    type: typeof raw.type === 'string' ? raw.type : '',
    state: isObject(raw.state) ? { ...raw.state } : {},
    config: isObject(raw.config) ? { ...raw.config } : {},
    mac: parsed?.mac,
    suffix: parsed?.suffix ?? '',
  };
}

/** The answer of GET /lights or GET /sensors -> resources. */
export function parseCollection(kind, body) {
  if (!isObject(body)) {
    return [];
  }
  return Object.entries(body)
    .map(([id, raw]) => toResource(kind, id, raw))
    .filter(Boolean);
}

/**
 * Applies a WebSocket event to the resources map (resource key -> resource).
 * @returns {{ type: 'changed' | 'added' | 'deleted' | 'unknown' | 'ignored',
 *   key?: string, before?: object, resource?: object }}
 */
export function applyEvent(resources, event) {
  if (!isObject(event) || event.t !== 'event' || !KINDS.includes(event.r) || event.id == null) {
    return { type: 'ignored' };
  }
  const key = `${event.r}/${event.id}`;
  if (event.e === 'deleted') {
    const before = resources.get(key);
    resources.delete(key);
    return { type: before ? 'deleted' : 'ignored', key, before };
  }
  if (event.e === 'added') {
    const raw = event.r === 'lights' ? event.light : event.sensor;
    const resource = toResource(event.r, event.id, raw);
    if (!resource) {
      return { type: 'unknown', key };
    }
    resources.set(key, resource);
    return { type: 'added', key, resource };
  }
  if (event.e !== 'changed') {
    return { type: 'ignored' };
  }
  const before = resources.get(key);
  if (!before) {
    return { type: 'unknown', key };
  }
  const resource = {
    ...before,
    state: isObject(event.state) ? { ...before.state, ...event.state } : before.state,
    config: isObject(event.config) ? { ...before.config, ...event.config } : before.config,
  };
  // `attr` (deCONZ 2.05.80+) carries name, lastseen, modelid, swversion...
  if (isObject(event.attr)) {
    for (const [k, v] of Object.entries(event.attr)) {
      if (!['kind', 'id', 'key', 'state', 'config', 'mac', 'suffix', 'uniqueid'].includes(k)) {
        resource[k] = v;
      }
    }
  }
  if (typeof event.name === 'string' && event.name.trim()) {
    resource.name = event.name.trim();
  }
  resources.set(key, resource);
  return { type: 'changed', key, before, resource };
}

/** Whether a resource is reachable, or undefined when it does not say. */
export function reachableOf(resource) {
  const value = resource.kind === 'lights' ? resource.state?.reachable : resource.config?.reachable;
  return typeof value === 'boolean' ? value : undefined;
}
