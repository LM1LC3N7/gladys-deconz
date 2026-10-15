// -----------------------------------------------------------------------------
// deCONZ resources -> Gladys devices + routing tables (pure).
//
// One Gladys device per physical Zigbee device (the IEEE address of the
// `uniqueid`): its lights and sensors become its features. External ids:
//   device  ext:<selector>:deconz:<ieee>          e.g. ...:deconz:00158d0002345678
//   feature <device>:<uniqueid suffix>:<key>      e.g. ...:01-0402:temperature
//   battery <device>:battery                      shared by the device's sensors
// They never depend on the REST ids of deCONZ, which change when a device is
// paired again.
// -----------------------------------------------------------------------------

import { BATTERY_FEATURE, batteryOf, mapResource } from './mapping.js';
import { reachableOf } from './resources.js';

export const DEVICE_TYPE = 'deconz';

/** Which resource names the device when it has no light, most telling first. */
const SENSOR_PRIORITY = [
  'ZHASwitch',
  'ZHAThermostat',
  'ZHAOpenClose',
  'ZHAPresence',
  'ZHAWater',
  'ZHAFire',
  'ZHACarbonMonoxide',
  'ZHAVibration',
  'ZHATemperature',
  'ZHAHumidity',
  'ZHAPressure',
  'ZHALightLevel',
  'ZHAPower',
  'ZHAConsumption',
];

const rank = (r) => {
  if (r.kind === 'lights') {
    return -1;
  }
  const i = SENSOR_PRIORITY.indexOf(r.type);
  return i === -1 ? SENSOR_PRIORITY.length : i;
};

const byId = (a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id);

/** Drops the undefined fields: Gladys stores what it receives. */
const compact = (object) =>
  Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined));

/**
 * What the mapping of a resource depends on: when it changes (a light starts
 * reporting a color, a sensor is renamed), the devices are built again.
 */
export function signatureOf(r) {
  return JSON.stringify([
    r.type,
    r.name,
    r.mac,
    Object.keys(r.state ?? {}).sort(),
    Object.keys(r.config ?? {}).sort(),
    r.ctmin,
    r.ctmax,
    r.config?.mode === 'cool' || r.config?.mode === 'precooling',
  ]);
}

function deviceParams(main, mac) {
  return [
    ['IEEE_ADDRESS', mac],
    ['MANUFACTURER', main.manufacturername],
    ['MODEL', main.modelid],
    ['SW_VERSION', main.swversion],
  ]
    .filter(([, value]) => typeof value === 'string' && value.trim() !== '')
    .map(([name, value]) => ({ name, value: value.trim().slice(0, 200) }));
}

/**
 * @param {object} gladys the SDK client (for the external ids)
 * @param {object[]} resources every known resource (resources.js)
 */
export function buildModel(gladys, resources) {
  const devices = [];
  /** resource key -> { deviceId, read(resource) -> [{ featureId, state }], button? } */
  const routes = new Map();
  /** featureId -> { resourceKey, write(value, resource) -> { path, body } } */
  const writers = new Map();
  /** deviceId -> resource keys (reachability) */
  const members = new Map();
  /** resource key -> signature */
  const signatures = new Map();
  const skipped = [];

  const groups = new Map();
  for (const r of resources) {
    signatures.set(r.key, signatureOf(r));
    if (!r.mac) {
      if (!/^(CLIP|Daylight)/.test(r.type)) {
        skipped.push({ key: r.key, reason: 'no Zigbee address (uniqueid)' });
      }
      continue;
    }
    if (!groups.has(r.mac)) {
      groups.set(r.mac, []);
    }
    groups.get(r.mac).push(r);
  }

  for (const [mac, group] of groups) {
    const ids = gladys.externalIds(DEVICE_TYPE, mac);
    const sorted = [...group].sort((a, b) => rank(a) - rank(b) || byId(a, b));
    const main = sorted[0];
    const context = {
      hasSwitch: sorted.some((r) => r.kind === 'lights' && 'on' in r.state),
      hasPower: sorted.some((r) => r.type === 'ZHAPower'),
    };
    const features = [];
    const seen = new Set();
    const keys = [];
    let battery = false;
    for (const r of sorted) {
      const mapped = mapResource(r, context);
      if (mapped.skipped) {
        skipped.push({ key: r.key, reason: mapped.skipped });
      }
      const local = (key) => ids.feature(r.suffix ? `${r.suffix}:${key}` : key);
      const hasBattery = batteryOf(r) !== undefined;
      if (mapped.skipped && !hasBattery) {
        continue;
      }
      keys.push(r.key);
      for (const f of mapped.features ?? []) {
        const external = local(f.key);
        if (seen.has(external)) {
          continue;
        }
        seen.add(external);
        features.push({ ...f, external_id: external, resource: r });
      }
      for (const [key, write] of Object.entries(mapped.writers ?? {})) {
        writers.set(local(key), { resourceKey: r.key, write });
      }
      battery ||= hasBattery;
      const buttonFeature = mapped.button ? local('buttonevent') : undefined;
      const read = mapped.read ?? (() => []);
      routes.set(r.key, {
        deviceId: ids.device,
        read: (resource) => {
          const states = read(resource).map((s) => ({ featureId: local(s.key), state: s.state }));
          const level = batteryOf(resource);
          if (level !== undefined) {
            states.push({ featureId: ids.feature('battery'), state: level });
          }
          return states;
        },
        button: buttonFeature,
      });
    }
    if (battery) {
      features.push({ ...BATTERY_FEATURE, name: 'Battery', external_id: ids.feature('battery') });
    }
    if (features.every((f) => f.key === BATTERY_FEATURE.key)) {
      continue;
    }
    members.set(ids.device, keys);
    // Two features with the same label (a double relay, two buttons): name them
    // after their resource.
    const counts = new Map();
    for (const f of features) {
      counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
    }
    devices.push({
      name: main.name.slice(0, 100),
      external_id: ids.device,
      features: features.map(({ key: _key, resource, ...f }) =>
        compact({
          ...f,
          name: (counts.get(f.name) > 1 && resource
            ? `${f.name} (${resource.name})`
            : f.name
          ).slice(0, 100),
        }),
      ),
      params: deviceParams(main, mac),
      should_poll: false,
    });
  }
  devices.sort((a, b) => a.name.localeCompare(b.name));
  return { devices, routes, writers, members, signatures, skipped };
}

/**
 * Whether a device is reachable: one of its resources says so. Resources that
 * do not tell (no `reachable`) count as reachable.
 */
export function deviceReachable(keys, resources) {
  const answers = (keys ?? [])
    .map((key) => resources.get(key))
    .filter(Boolean)
    .map(reachableOf);
  return answers.length === 0 || answers.some((a) => a !== false);
}
