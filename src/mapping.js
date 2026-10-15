// -----------------------------------------------------------------------------
// One deCONZ resource (a light or a sensor of the REST API) -> Gladys features,
// a reader and writers (pure).
//
// `mapResource` returns:
//   features  the Gladys features (key relative to the resource),
//   read      (resource) -> [{ key, state }] the current values,
//   writers   { [featureKey]: (value, resource) -> { path, body } } the REST
//             request of a command,
//   button    true for a remote (its events fire the scene trigger),
//   skipped   a reason when nothing is mapped (unsupported type).
// The battery, shared by the sensors of a device, is handled by devices.js.
// The categories, types and value conventions follow the Gladys core: the same
// as its Zigbee2MQTT service (server/services/zigbee2mqtt/exposes), with the
// enums of server/utils/constants.js.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { BUTTON_VALUES } from './buttons.js';
import { hueSatToInt, intToHueSat, intToXy, xyToInt } from './colors.js';

// Value enums of the Gladys core (server/utils/constants.js).
export const COVER_STATE = { STOP: 0, OPEN: 1, CLOSE: -1 };
export const OPENING_SENSOR_STATE = { OPEN: 0, CLOSE: 1 };
export const THERMOSTAT_MODE = { OFF: 0, HEATING: 1, COOLING: 2, AUTO: 3 };
export const THERMOSTAT_OPERATING_STATE = { IDLE: 0, HEATING: 1, COOLING: 2 };

/** deCONZ thermostat modes -> Gladys; the first one of a Gladys value is the one written. */
const MODES = [
  ['off', THERMOSTAT_MODE.OFF],
  ['heat', THERMOSTAT_MODE.HEATING],
  ['cool', THERMOSTAT_MODE.COOLING],
  ['auto', THERMOSTAT_MODE.AUTO],
  ['emergency heating', THERMOSTAT_MODE.HEATING],
  ['precooling', THERMOSTAT_MODE.COOLING],
];

/** Light types that are lamps or dimmers. */
const LIGHT_TYPES = new Set([
  'Extended color light',
  'Color temperature light',
  'Color light',
  'Color dimmable light',
  'Dimmable light',
  'Dimmable plug-in unit',
  'Dimmer switch',
  'Level control switch',
]);
/** Light types that are plugs or relays: a `switch` in Gladys (as in Home Assistant). */
const PLUG_TYPES = new Set([
  'On/Off light',
  'On/Off light switch',
  'On/Off plug-in unit',
  'On/Off output',
  'Smart plug',
]);
/** Light types without anything to control (the gateway itself, repeaters). */
const IGNORED_LIGHT_TYPES = new Set(['Configuration tool', 'Range extender']);
/** Sensors that only exist in the gateway (CLIP, daylight): no physical device. */
const VIRTUAL_SENSOR = /^(CLIP|Daylight)/;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const round = (v, digits) => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};
const scaled = (v, divisor, digits = 2) => {
  const n = num(v);
  return n === undefined ? undefined : round(n / divisor, digits);
};
const bool = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : undefined);
const has = (object, key) => object != null && Object.hasOwn(object, key);

const feature = (key, name, spec) => ({
  key,
  name,
  read_only: true,
  has_feedback: true,
  keep_history: true,
  ...spec,
});

/** The values of a list of [key, value] pairs, the undefined ones left out. */
const values = (pairs) =>
  pairs.filter(([, state]) => state !== undefined).map(([key, state]) => ({ key, state }));

// --- Lights, plugs, covers ---------------------------------------------------

const lightState = (path) => (resource, body) => ({
  path: `/lights/${resource.id}/${path}`,
  body,
});
const putState = lightState('state');

function mapCover(r) {
  if (!has(r.state, 'lift')) {
    return { skipped: 'cover without a lift position (deCONZ older than 2.05.80?)' };
  }
  return {
    features: [
      feature('state', 'State', {
        category: C.SHUTTER,
        type: T.SHUTTER.STATE,
        min: -1,
        max: 1,
        read_only: false,
        keep_history: false,
      }),
      // deCONZ lift: 0 = open, 100 = closed. Gladys position: 100 = open.
      feature('position', 'Position', {
        category: C.SHUTTER,
        type: T.SHUTTER.POSITION,
        unit: U.PERCENT,
        min: 0,
        max: 100,
        read_only: false,
      }),
    ],
    read: (res) =>
      values([
        [
          'state',
          typeof res.state?.open === 'boolean'
            ? res.state.open
              ? COVER_STATE.OPEN
              : COVER_STATE.CLOSE
            : undefined,
        ],
        ['position', num(res.state?.lift) === undefined ? undefined : 100 - res.state.lift],
      ]),
    writers: {
      state: (value, res) => {
        const v = Math.round(Number(value));
        if (v === COVER_STATE.OPEN) {
          return putState(res, { open: true });
        }
        if (v === COVER_STATE.CLOSE) {
          return putState(res, { open: false });
        }
        if (v === COVER_STATE.STOP) {
          return putState(res, { stop: true });
        }
        throw new Error(`unknown cover command ${value}`);
      },
      position: (value, res) =>
        putState(res, { lift: 100 - Math.min(100, Math.max(0, Math.round(Number(value)))) }),
    },
  };
}

function mapPlug() {
  return {
    features: [
      feature('on', 'On/Off', {
        category: C.SWITCH,
        type: T.SWITCH.BINARY,
        min: 0,
        max: 1,
        read_only: false,
      }),
    ],
    read: (res) => values([['on', bool(res.state?.on)]]),
    writers: { on: (value, res) => putState(res, { on: Number(value) === 1 }) },
  };
}

/** The light color as an RGB integer, from the color mode the light reports. */
export function lightColor(state) {
  if (!state) {
    return undefined;
  }
  if (state.colormode === 'hs' && num(state.hue) !== undefined && num(state.sat) !== undefined) {
    return hueSatToInt(state.hue, state.sat);
  }
  if (Array.isArray(state.xy) && state.xy.length === 2) {
    return xyToInt(Number(state.xy[0]), Number(state.xy[1]));
  }
  if (num(state.hue) !== undefined && num(state.sat) !== undefined) {
    return hueSatToInt(state.hue, state.sat);
  }
  return undefined;
}

function mapLight(r) {
  const s = r.state;
  const features = [
    feature('on', 'On/Off', {
      category: C.LIGHT,
      type: T.LIGHT.BINARY,
      min: 0,
      max: 1,
      read_only: false,
    }),
  ];
  const writers = { on: (value, res) => putState(res, { on: Number(value) === 1 }) };
  if (has(s, 'bri')) {
    features.push(
      feature('bri', 'Brightness', {
        category: C.LIGHT,
        type: T.LIGHT.BRIGHTNESS,
        min: 0,
        max: 255,
        read_only: false,
      }),
    );
    writers.bri = (value, res) => {
      const bri = Math.min(255, Math.max(0, Math.round(Number(value))));
      return putState(res, bri > 0 ? { on: true, bri } : { on: false });
    };
  }
  if (has(s, 'ct')) {
    // Mireds, like the core Zigbee2MQTT color temperature.
    const min = num(r.ctmin) > 0 ? r.ctmin : 153;
    const max = num(r.ctmax) > min ? r.ctmax : 500;
    features.push(
      feature('ct', 'Color temperature', {
        category: C.LIGHT,
        type: T.LIGHT.TEMPERATURE,
        min,
        max,
        read_only: false,
      }),
    );
    // deCONZ refuses a color on a light that is off (error 201): turn it on too.
    writers.ct = (value, res) =>
      putState(res, { on: true, ct: Math.min(max, Math.max(min, Math.round(Number(value)))) });
  }
  if (has(s, 'xy') || (has(s, 'hue') && has(s, 'sat'))) {
    features.push(
      feature('color', 'Color', {
        category: C.LIGHT,
        type: T.LIGHT.COLOR,
        min: 0,
        max: 16777215,
        read_only: false,
      }),
    );
    writers.color = (value, res) => {
      const rgb = Math.min(16777215, Math.max(0, Math.round(Number(value))));
      // xy when the light reports it (deCONZ converts for the light), else hue/sat.
      return putState(res, {
        on: true,
        ...(has(res.state, 'xy') ? { xy: intToXy(rgb) } : intToHueSat(rgb)),
      });
    };
  }
  return {
    features,
    read: (res) =>
      values([
        ['on', bool(res.state?.on)],
        ['bri', num(res.state?.bri)],
        ['ct', num(res.state?.ct)],
        ['color', lightColor(res.state)],
      ]).filter((v) => features.some((f) => f.key === v.key)),
    writers,
  };
}

function mapLightResource(r) {
  if (IGNORED_LIGHT_TYPES.has(r.type)) {
    return { skipped: `${r.type}: nothing to control` };
  }
  if (/window covering/i.test(r.type)) {
    return mapCover(r);
  }
  if (has(r.state, 'on') && PLUG_TYPES.has(r.type)) {
    return mapPlug();
  }
  if (has(r.state, 'on') && LIGHT_TYPES.has(r.type)) {
    return mapLight(r);
  }
  // Locks, sirens, fans, legacy covers: later milestones.
  return { skipped: `light type "${r.type}" is not supported yet` };
}

// --- Sensors -----------------------------------------------------------------

const decimal = (category, unit, min, max) => ({
  category,
  type: T.SENSOR.DECIMAL,
  unit,
  min,
  max,
});
const binary = (category) => ({ category, type: T.SENSOR.BINARY, min: 0, max: 1 });

/** A sensor with one value: [state key (= feature key), label, spec, read(state value)]. */
const SINGLE = {
  ZHATemperature: [
    'temperature',
    'Temperature',
    decimal(C.TEMPERATURE_SENSOR, U.CELSIUS, -100, 150),
    (v) => scaled(v, 100),
  ],
  ZHAHumidity: [
    'humidity',
    'Humidity',
    decimal(C.HUMIDITY_SENSOR, U.PERCENT, 0, 100),
    (v) => scaled(v, 100),
  ],
  ZHAPressure: [
    'pressure',
    'Pressure',
    decimal(C.PRESSURE_SENSOR, U.HECTO_PASCAL, 0, 2000),
    (v) => num(v),
  ],
  ZHAOpenClose: [
    'open',
    'Opening',
    binary(C.OPENING_SENSOR),
    // Gladys opening sensor: 1 = closed, 0 = open.
    (v) =>
      typeof v === 'boolean'
        ? v
          ? OPENING_SENSOR_STATE.OPEN
          : OPENING_SENSOR_STATE.CLOSE
        : undefined,
  ],
  ZHAPresence: ['presence', 'Motion', binary(C.MOTION_SENSOR), bool],
  ZHAWater: ['water', 'Water leak', binary(C.LEAK_SENSOR), bool],
  ZHAFire: ['fire', 'Smoke', binary(C.SMOKE_SENSOR), bool],
  ZHACarbonMonoxide: ['carbonmonoxide', 'Carbon monoxide', binary(C.CO_SENSOR), bool],
  ZHAMoisture: [
    'moisture',
    'Soil moisture',
    decimal(C.SOIL_MOISTURE_SENSOR, U.PERCENT, 0, 100),
    (v) => scaled(v, 100),
  ],
  ZHAAirQuality: [
    'airqualityppb',
    'VOC',
    { category: C.VOC_SENSOR, type: T.VOC_SENSOR.DECIMAL, unit: U.PPB, min: 0, max: 100_000 },
    (v) => num(v),
  ],
};

/** lightlevel = 10000 * log10(lux) + 1, when the gateway gives no lux. */
const luxOf = (state) => {
  if (num(state?.lux) !== undefined) {
    return state.lux;
  }
  const level = num(state?.lightlevel);
  return level === undefined ? undefined : Math.round(10 ** ((Math.max(level, 1) - 1) / 10000));
};

/** Power, voltage, current (mA in deCONZ), energy (Wh): on the plug or on a meter. */
function electrical(r, context) {
  const plug = context.hasSwitch;
  const category = plug ? C.SWITCH : C.ENERGY_SENSOR;
  const types = plug ? T.SWITCH : T.ENERGY_SENSOR;
  const s = r.state ?? {};
  const candidates = [
    ['power', 'Power', types.POWER, U.WATT, 0, 100_000, (st) => num(st?.power)],
    ['voltage', 'Voltage', types.VOLTAGE, U.VOLT, 0, 1000, (st) => num(st?.voltage)],
    ['current', 'Current', types.CURRENT, U.AMPERE, 0, 1000, (st) => scaled(st?.current, 1000, 3)],
    [
      'consumption',
      'Energy',
      plug ? T.SWITCH.ENERGY : T.ENERGY_SENSOR.INDEX,
      U.KILOWATT_HOUR,
      0,
      1e9,
      (st) => scaled(st?.consumption, 1000, 3),
    ],
  ].filter(
    // A ZHAConsumption next to a ZHAPower repeats its power: one is enough.
    ([key]) => has(s, key) && !(key === 'power' && r.type === 'ZHAConsumption' && context.hasPower),
  );
  return {
    features: candidates.map(([key, name, type, unit, min, max]) =>
      feature(key, name, { category, type, unit, min, max }),
    ),
    read: (res) => values(candidates.map(([key, , , , , , read]) => [key, read(res.state)])),
    writers: {},
  };
}

function mapThermostat(r) {
  const putConfig = (res, body) => ({ path: `/sensors/${res.id}/config`, body });
  const features = [];
  const writers = {};
  if (has(r.state, 'temperature')) {
    features.push(
      feature('temperature', 'Temperature', decimal(C.TEMPERATURE_SENSOR, U.CELSIUS, -100, 150)),
    );
  }
  if (has(r.config, 'heatsetpoint')) {
    features.push(
      feature('heatsetpoint', 'Setpoint', {
        category: C.THERMOSTAT,
        type: T.THERMOSTAT.TARGET_TEMPERATURE,
        unit: U.CELSIUS,
        // deCONZ accepts 500-3200 (centi-degrees).
        min: 5,
        max: 32,
        step: 0.5,
        read_only: false,
      }),
    );
    writers.heatsetpoint = (value, res) =>
      putConfig(res, { heatsetpoint: Math.round(Number(value) * 100) });
  }
  if (typeof r.config?.mode === 'string') {
    const supported = [THERMOSTAT_MODE.OFF, THERMOSTAT_MODE.HEATING, THERMOSTAT_MODE.AUTO];
    if (['cool', 'precooling'].includes(r.config.mode) || has(r.config, 'coolsetpoint')) {
      supported.push(THERMOSTAT_MODE.COOLING);
    }
    features.push(
      feature('mode', 'Mode', {
        category: C.THERMOSTAT,
        type: T.THERMOSTAT.MODE,
        min: 0,
        max: 3,
        read_only: false,
        keep_history: false,
        supported_options: supported.map((value, i) => ({ value, sort_order: i + 1 })),
      }),
    );
    writers.mode = (value, res) => {
      const wanted = Math.round(Number(value));
      const mode = MODES.find(([, v]) => v === wanted);
      if (!mode) {
        throw new Error(`thermostat mode ${value} is not supported`);
      }
      return putConfig(res, { mode: mode[0] });
    };
  }
  if (typeof r.state?.on === 'boolean') {
    features.push(
      feature('heating', 'Activity', {
        category: C.THERMOSTAT,
        type: T.THERMOSTAT.OPERATING_STATE,
        min: 0,
        max: 2,
      }),
    );
  }
  return {
    features,
    read: (res) =>
      values([
        ['temperature', scaled(res.state?.temperature, 100)],
        ['heatsetpoint', scaled(res.config?.heatsetpoint, 100)],
        ['mode', MODES.find(([name]) => name === res.config?.mode)?.[1]],
        [
          'heating',
          typeof res.state?.on === 'boolean'
            ? res.state.on
              ? THERMOSTAT_OPERATING_STATE.HEATING
              : THERMOSTAT_OPERATING_STATE.IDLE
            : undefined,
        ],
      ]).filter((v) => features.some((f) => f.key === v.key)),
    writers,
  };
}

function mapSensorResource(r, context) {
  if (VIRTUAL_SENSOR.test(r.type)) {
    return { skipped: `${r.type} is a virtual sensor of the gateway` };
  }
  const single = SINGLE[r.type];
  if (single) {
    const [stateKey, label, spec, read] = single;
    return {
      features: [feature(stateKey, label, spec)],
      read: (res) => values([[stateKey, read(res.state?.[stateKey])]]),
      writers: {},
    };
  }
  switch (r.type) {
    case 'ZHALightLevel':
      return {
        features: [feature('lux', 'Illuminance', decimal(C.LIGHT_SENSOR, U.LUX, 0, 100_000))],
        read: (res) => values([['lux', luxOf(res.state)]]),
        writers: {},
      };
    case 'ZHAPower':
    case 'ZHAConsumption':
      return electrical(r, context);
    case 'ZHABattery':
      // The battery of the device, shared with the `config.battery` of its sensors.
      return { features: [], read: () => [], writers: {} };
    case 'ZHAVibration': {
      const features = [
        feature('vibration', 'Vibration', {
          category: C.VIBRATION_SENSOR,
          type: T.VIBRATION_SENSOR.BINARY,
          min: 0,
          max: 1,
        }),
      ];
      if (has(r.state, 'tiltangle')) {
        features.push(
          feature('tiltangle', 'Tilt angle', {
            category: C.VIBRATION_SENSOR,
            type: T.VIBRATION_SENSOR.TILT_ANGLE,
            unit: U.DEGREE,
            min: 0,
            max: 360,
          }),
        );
      }
      return {
        features,
        read: (res) =>
          values([
            ['vibration', bool(res.state?.vibration)],
            ['tiltangle', has(r.state, 'tiltangle') ? num(res.state?.tiltangle) : undefined],
          ]),
        writers: {},
      };
    }
    case 'ZHAThermostat':
      return mapThermostat(r);
    case 'ZHASwitch':
    case 'ZGPSwitch':
      return {
        features: [
          feature('buttonevent', 'Button', {
            category: C.BUTTON,
            type: T.BUTTON.CLICK,
            min: BUTTON_VALUES[0],
            max: BUTTON_VALUES.at(-1),
            keep_history: false,
          }),
        ],
        // A button has no state to read: its events are pushed one by one.
        read: () => [],
        writers: {},
        button: true,
      };
    default:
      return { skipped: `sensor type "${r.type}" is not supported yet` };
  }
}

/** The battery of a sensor (config.battery, or the state of a ZHABattery), in %. */
export function batteryOf(r) {
  if (r.kind !== 'sensors') {
    return undefined;
  }
  const value = r.type === 'ZHABattery' ? num(r.state?.battery) : num(r.config?.battery);
  return value === undefined ? undefined : Math.min(100, Math.max(0, Math.round(value)));
}

export const BATTERY_FEATURE = {
  key: 'battery',
  category: C.BATTERY,
  type: T.BATTERY.INTEGER,
  unit: U.PERCENT,
  min: 0,
  max: 100,
  read_only: true,
  has_feedback: true,
  keep_history: true,
};

/**
 * @param {object} r the resource (see resources.js)
 * @param {{ hasSwitch?: boolean, hasPower?: boolean }} context the device
 *   context: power and energy of a plug or a light are `switch` features (like
 *   the core Zigbee2MQTT mapping), a meter's are `energy-sensor` ones.
 */
export function mapResource(r, context = {}) {
  const mapped = r.kind === 'lights' ? mapLightResource(r) : mapSensorResource(r, context);
  if (mapped.skipped) {
    return mapped;
  }
  return { button: false, ...mapped };
}
