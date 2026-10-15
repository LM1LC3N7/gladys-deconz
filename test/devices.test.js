// -----------------------------------------------------------------------------
// The fixtures through the mapping: categories, types, units, values and
// external ids, compared with the conventions of the Gladys core.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { buildModel, deviceReachable, signatureOf } from '../src/devices.js';
import { COVER_STATE, OPENING_SENSOR_STATE, THERMOSTAT_MODE, mapResource } from '../src/mapping.js';
import { parseCollection, toResource } from '../src/resources.js';
import { LIGHTS, SENSORS, deviceId, featureId } from './fixtures/gateway.js';

const gladys = createFakeGladys();
const resources = [...parseCollection('lights', LIGHTS), ...parseCollection('sensors', SENSORS)];
const model = buildModel(gladys, resources);
const byKey = new Map(resources.map((r) => [r.key, r]));

const deviceOf = (uniqueid) => model.devices.find((d) => d.external_id === deviceId(uniqueid));
const featureOf = (uniqueid, key) =>
  deviceOf(uniqueid).features.find((f) => f.external_id === featureId(uniqueid, key));
/** The values read from a resource, by feature external id. */
const read = (key, resource = byKey.get(key)) =>
  Object.fromEntries(
    model.routes
      .get(key)
      .read(resource)
      .map((s) => [s.featureId, s.state]),
  );

test('the fake Gladys accepts the devices (categories, types, units)', async () => {
  await gladys.connect();
  await gladys.publishDiscoveredDevices(model.devices);
  assert.equal(gladys.fake.discoveredDevices.length, 18);
});

test('a color light: on, brightness, color temperature in mireds, color', () => {
  const uid = LIGHTS[2].uniqueid;
  const d = deviceOf(uid);
  assert.equal(d.name, 'Salon');
  assert.deepEqual(d.params, [
    { name: 'IEEE_ADDRESS', value: '00178801081a2b3c' },
    { name: 'MANUFACTURER', value: 'Signify Netherlands B.V.' },
    { name: 'MODEL', value: 'LCA001' },
    { name: 'SW_VERSION', value: '1.104.2' },
  ]);
  assert.deepEqual(
    d.features.map((f) => [f.name, f.category, f.type, f.min, f.max, f.read_only]),
    [
      ['On/Off', C.LIGHT, T.LIGHT.BINARY, 0, 1, false],
      ['Brightness', C.LIGHT, T.LIGHT.BRIGHTNESS, 0, 255, false],
      ['Color temperature', C.LIGHT, T.LIGHT.TEMPERATURE, 153, 500, false],
      ['Color', C.LIGHT, T.LIGHT.COLOR, 0, 16777215, false],
    ],
  );
  const values = read('lights/2');
  assert.equal(values[featureId(uid, 'on')], 1);
  assert.equal(values[featureId(uid, 'bri')], 200);
  assert.equal(values[featureId(uid, 'ct')], 366);
  assert.equal(typeof values[featureId(uid, 'color')], 'number');
  // A hue/saturation light: its color from hue/sat.
  assert.equal(read('lights/8')[featureId(LIGHTS[8].uniqueid, 'color')], 0x00ff00);
});

test('plugs and relays are switches; the power of a plug is a switch feature', () => {
  const plug = LIGHTS[4].uniqueid;
  assert.equal(featureOf(plug, 'on').category, C.SWITCH);
  const power = deviceOf(plug).features.filter((f) => f.type === T.SWITCH.POWER);
  assert.equal(power.length, 1, 'the power of ZHAConsumption is left to ZHAPower');
  const values = read('sensors/11');
  const [p, v, a] = ['power', 'voltage', 'current'].map((k) => featureId(SENSORS[11].uniqueid, k));
  assert.deepEqual([values[p], values[v], values[a]], [1520, 231, 6.58], 'current in A');
  const energy = featureOf(SENSORS[12].uniqueid, 'consumption');
  assert.deepEqual(
    [energy.category, energy.type, energy.unit],
    [C.SWITCH, T.SWITCH.ENERGY, U.KILOWATT_HOUR],
  );
  assert.equal(read('sensors/12')[energy.external_id], 123.456);
  // Two relays of one device: one device, two features named after their relay.
  const relay = deviceOf(LIGHTS[6].uniqueid);
  assert.deepEqual(
    relay.features.map((f) => f.name),
    ['On/Off (Relais cuisine)', 'On/Off (Relais cellier)'],
  );
});

test('a standalone meter is an energy sensor with an index', () => {
  const uid = SENSORS[13].uniqueid;
  const index = featureOf(uid, 'consumption');
  assert.deepEqual([index.category, index.type], [C.ENERGY_SENSOR, T.ENERGY_SENSOR.INDEX]);
  assert.equal(featureOf(uid, 'power').category, C.ENERGY_SENSOR);
  assert.equal(read('sensors/13')[index.external_id], 4567.89);
});

test('a cover: position 100 = open (deCONZ lift 0 = open)', () => {
  const uid = LIGHTS[5].uniqueid;
  assert.equal(featureOf(uid, 'position').category, C.SHUTTER);
  const values = read('lights/5');
  assert.equal(values[featureId(uid, 'position')], 70);
  assert.equal(values[featureId(uid, 'state')], COVER_STATE.OPEN);
  const old = toResource('lights', 50, {
    type: 'Window covering device',
    uniqueid: '00:0d:6f:ff:fe:aa:bb:cd-01',
    state: { on: true, bri: 30 },
  });
  assert.match(mapResource(old).skipped, /lift/);
});

test('the sensors of one Xiaomi weather sensor form one device, with its battery', () => {
  const uid = SENSORS[2].uniqueid;
  const d = deviceOf(uid);
  assert.equal(d.name, 'Météo bureau');
  assert.deepEqual(
    d.features.map((f) => [f.name, f.category, f.unit]),
    [
      ['Temperature', C.TEMPERATURE_SENSOR, U.CELSIUS],
      ['Humidity', C.HUMIDITY_SENSOR, U.PERCENT],
      ['Pressure', C.PRESSURE_SENSOR, U.HECTO_PASCAL],
      ['Battery', C.BATTERY, U.PERCENT],
    ],
  );
  assert.equal(read('sensors/2')[featureId(uid, 'temperature')], 21.54);
  assert.equal(read('sensors/3')[featureId(SENSORS[3].uniqueid, 'humidity')], 48.75);
  assert.equal(read('sensors/4')[featureId(SENSORS[4].uniqueid, 'pressure')], 1013);
  assert.equal(read('sensors/4')[`${deviceId(uid)}:battery`], 95);
});

test('binary sensors follow the core conventions', () => {
  const door = SENSORS[5].uniqueid;
  assert.equal(featureOf(door, 'open').category, C.OPENING_SENSOR);
  assert.equal(featureOf(door, 'open').type, T.SENSOR.BINARY);
  assert.equal(read('sensors/5')[featureId(door, 'open')], OPENING_SENSOR_STATE.CLOSE);
  const opened = { ...byKey.get('sensors/5'), state: { open: true } };
  assert.equal(read('sensors/5', opened)[featureId(door, 'open')], OPENING_SENSOR_STATE.OPEN);
  assert.equal(featureOf(SENSORS[6].uniqueid, 'presence').category, C.MOTION_SENSOR);
  assert.equal(featureOf(SENSORS[9].uniqueid, 'water').category, C.LEAK_SENSOR);
  assert.equal(featureOf(SENSORS[10].uniqueid, 'fire').category, C.SMOKE_SENSOR);
  assert.equal(featureOf(SENSORS[18].uniqueid, 'carbonmonoxide').category, C.CO_SENSOR);
  const vibration = featureOf(SENSORS[17].uniqueid, 'vibration');
  assert.deepEqual(
    [vibration.category, vibration.type],
    [C.VIBRATION_SENSOR, T.VIBRATION_SENSOR.BINARY],
  );
  assert.equal(read('sensors/17')[featureId(SENSORS[17].uniqueid, 'tiltangle')], 12);
});

test('the Hue motion sensor: motion, illuminance in lux, temperature, one battery', () => {
  const uid = SENSORS[6].uniqueid;
  const d = deviceOf(uid);
  assert.equal(d.name, 'Mouvement couloir');
  assert.deepEqual(
    d.features.map((f) => f.name),
    ['Motion', 'Temperature', 'Illuminance', 'Battery'],
  );
  assert.equal(read('sensors/7')[featureId(SENSORS[7].uniqueid, 'lux')], 32);
  const noLux = { ...byKey.get('sensors/7'), state: { lightlevel: 15052 } };
  assert.equal(read('sensors/7', noLux)[featureId(SENSORS[7].uniqueid, 'lux')], 32);
});

test('the ZHABattery of a device is its battery', () => {
  const uid = SENSORS[18].uniqueid;
  assert.deepEqual(
    deviceOf(uid).features.map((f) => f.name),
    ['Carbon monoxide', 'Battery'],
  );
  assert.equal(read('sensors/19')[`${deviceId(uid)}:battery`], 64);
});

test('a thermostat: temperature, setpoint, mode, activity', () => {
  const uid = SENSORS[14].uniqueid;
  const d = deviceOf(uid);
  assert.deepEqual(
    d.features.map((f) => [f.name, f.category, f.type]),
    [
      ['Temperature', C.TEMPERATURE_SENSOR, T.SENSOR.DECIMAL],
      ['Setpoint', C.THERMOSTAT, T.THERMOSTAT.TARGET_TEMPERATURE],
      ['Mode', C.THERMOSTAT, T.THERMOSTAT.MODE],
      ['Activity', C.THERMOSTAT, T.THERMOSTAT.OPERATING_STATE],
      ['Battery', C.BATTERY, T.BATTERY.INTEGER],
    ],
  );
  assert.deepEqual(
    featureOf(uid, 'mode').supported_options.map((o) => o.value),
    [THERMOSTAT_MODE.OFF, THERMOSTAT_MODE.HEATING, THERMOSTAT_MODE.AUTO],
  );
  const values = read('sensors/14');
  assert.equal(values[featureId(uid, 'temperature')], 20.5);
  assert.equal(values[featureId(uid, 'heatsetpoint')], 21);
  assert.equal(values[featureId(uid, 'mode')], THERMOSTAT_MODE.AUTO);
  assert.equal(values[featureId(uid, 'heating')], 1);
  const writers = model.writers;
  assert.throws(() => writers.get(featureId(uid, 'mode')).write(9, byKey.get('sensors/14')));
});

test('remotes: a button feature, no value read at startup', () => {
  const uid = SENSORS[15].uniqueid;
  const button = featureOf(uid, 'buttonevent');
  assert.deepEqual([button.category, button.type], [C.BUTTON, T.BUTTON.CLICK]);
  assert.equal(model.routes.get('sensors/15').button, button.external_id);
  assert.deepEqual(Object.keys(read('sensors/15')), [`${deviceId(uid)}:battery`]);
});

test('what is left out, and why', () => {
  const reasons = Object.fromEntries(model.skipped.map((s) => [s.key, s.reason]));
  assert.match(reasons['lights/1'], /nothing to control/);
  assert.match(reasons['lights/9'], /Warning device.*not supported yet/);
  assert.match(reasons['sensors/1'], /virtual/);
  assert.match(reasons['sensors/22'], /ZHAAlarm.*not supported yet/);
  assert.equal(reasons['sensors/20'], undefined, 'CLIP sensors are left out silently');
  assert.ok(!model.devices.some((d) => d.name === 'Sirène'));
});

test('the external ids never depend on the deCONZ ids', () => {
  const moved = parseCollection('sensors', { 77: SENSORS[2] });
  const again = buildModel(gladys, moved);
  assert.equal(
    again.devices[0].features[0].external_id,
    featureId(SENSORS[2].uniqueid, 'temperature'),
  );
});

test('signature and reachability', () => {
  const salon = byKey.get('lights/2');
  assert.equal(signatureOf(salon), signatureOf({ ...salon, state: { ...salon.state, bri: 3 } }));
  assert.notEqual(signatureOf(salon), signatureOf({ ...salon, name: 'Séjour' }));
  const keys = ['lights/6', 'lights/7'];
  const map = new Map(byKey);
  assert.equal(deviceReachable(keys, map), true);
  map.set('lights/6', { ...map.get('lights/6'), state: { reachable: false } });
  assert.equal(deviceReachable(keys, map), true, 'one relay still answers');
  map.set('lights/7', { ...map.get('lights/7'), state: { reachable: false } });
  assert.equal(deviceReachable(keys, map), false);
});
