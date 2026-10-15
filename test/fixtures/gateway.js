// REST answers and WebSocket events shaped like the ones of a deCONZ 2.2x
// gateway (ConBee II), following the deCONZ REST API documentation: one light
// of each kind, the usual Xiaomi / Hue / IKEA sensors and remotes, and the
// resources to leave out (gateway, CLIP, daylight, unsupported).

export const HOST = '192.168.1.20';
export const API_KEY = 'A1B2C3D4E5';

export const CONFIG = {
  name: 'Phoscon-GW',
  bridgeid: '00212EFFFF0A1B2C',
  modelid: 'deCONZ',
  swversion: '2.28.1',
  apiversion: '1.16.0',
  mac: '00:21:2e:0a:1b:2c',
  ipaddress: HOST,
  websocketport: 8081,
  websocketnotifyall: true,
  zigbeechannel: 15,
};

const at = '2026-10-15T08:00:00.000';

export const LIGHTS = {
  1: {
    name: 'Configuration tool 1',
    type: 'Configuration tool',
    modelid: 'ConBee II',
    manufacturername: 'dresden elektronik',
    uniqueid: '00:21:2e:ff:ff:0a:1b:2c-01',
    state: { reachable: true },
  },
  2: {
    name: 'Salon',
    type: 'Extended color light',
    manufacturername: 'Signify Netherlands B.V.',
    modelid: 'LCA001',
    swversion: '1.104.2',
    uniqueid: '00:17:88:01:08:1a:2b:3c-0b',
    hascolor: true,
    ctmin: 153,
    ctmax: 500,
    state: {
      on: true,
      bri: 200,
      ct: 366,
      xy: [0.4573, 0.41],
      hue: 8402,
      sat: 140,
      colormode: 'ct',
      effect: 'none',
      alert: 'none',
      reachable: true,
    },
  },
  3: {
    name: 'Couloir',
    type: 'Dimmable light',
    manufacturername: 'IKEA of Sweden',
    modelid: 'TRADFRI bulb E27 W opal 1000lm',
    uniqueid: '00:0b:57:ff:fe:12:34:56-01',
    state: { on: false, bri: 1, alert: 'none', reachable: true },
  },
  4: {
    name: 'Prise lave-linge',
    type: 'Smart plug',
    manufacturername: 'LUMI',
    modelid: 'lumi.plug.maeu01',
    uniqueid: '00:15:8d:00:04:5a:6b:7c-01',
    state: { on: true, alert: 'none', reachable: true },
  },
  5: {
    name: 'Volet chambre',
    type: 'Window covering device',
    manufacturername: 'ubisys',
    modelid: 'J1 (5502)',
    uniqueid: '00:0d:6f:ff:fe:aa:bb:cc-01',
    state: { open: true, lift: 30, bri: 76, on: true, alert: 'none', reachable: true },
  },
  6: {
    name: 'Relais cuisine',
    type: 'On/Off output',
    manufacturername: 'SONOFF',
    modelid: 'ZBMINI',
    uniqueid: '00:12:4b:00:22:33:44:55-01',
    state: { on: false, alert: 'none', reachable: true },
  },
  7: {
    name: 'Relais cellier',
    type: 'On/Off output',
    manufacturername: 'SONOFF',
    modelid: 'ZBMINI',
    uniqueid: '00:12:4b:00:22:33:44:55-02',
    state: { on: true, alert: 'none', reachable: true },
  },
  8: {
    name: 'Ruban LED',
    type: 'Color light',
    manufacturername: '_TZ3000_dbou1ap4',
    modelid: 'TS0505A',
    uniqueid: '84:2e:14:ff:fe:01:02:03-01',
    state: { on: true, bri: 254, hue: 21845, sat: 255, colormode: 'hs', reachable: true },
  },
  9: {
    name: 'Sirène',
    type: 'Warning device',
    uniqueid: '00:0d:6f:00:0b:12:34:56-01',
    state: { alert: 'none', reachable: true },
  },
};

export const SENSORS = {
  1: {
    name: 'Daylight',
    type: 'Daylight',
    modelid: 'PHDL00',
    uniqueid: '00:21:2e:ff:ff:0a:1b:2c-01',
    state: { daylight: true, status: 170, lastupdated: at },
    config: { on: true, configured: true, sunriseoffset: 30, sunsetoffset: -30 },
  },
  2: {
    name: 'Météo bureau',
    type: 'ZHATemperature',
    manufacturername: 'LUMI',
    modelid: 'lumi.weather',
    swversion: '20191205',
    uniqueid: '00:15:8d:00:02:34:56:78-01-0402',
    state: { temperature: 2154, lastupdated: at },
    config: { on: true, reachable: true, battery: 95, offset: 0 },
  },
  3: {
    name: 'Humidité bureau',
    type: 'ZHAHumidity',
    manufacturername: 'LUMI',
    modelid: 'lumi.weather',
    uniqueid: '00:15:8d:00:02:34:56:78-01-0405',
    state: { humidity: 4875, lastupdated: at },
    config: { on: true, reachable: true, battery: 95, offset: 0 },
  },
  4: {
    name: 'Pression bureau',
    type: 'ZHAPressure',
    manufacturername: 'LUMI',
    modelid: 'lumi.weather',
    uniqueid: '00:15:8d:00:02:34:56:78-01-0403',
    state: { pressure: 1013, lastupdated: at },
    config: { on: true, reachable: true, battery: 95 },
  },
  5: {
    name: 'Porte entrée',
    type: 'ZHAOpenClose',
    manufacturername: 'LUMI',
    modelid: 'lumi.sensor_magnet.aq2',
    uniqueid: '00:15:8d:00:03:11:22:33-01-0006',
    state: { open: false, lastupdated: at },
    config: { on: true, reachable: true, battery: 100, temperature: 2300 },
  },
  6: {
    name: 'Mouvement couloir',
    type: 'ZHAPresence',
    manufacturername: 'Signify Netherlands B.V.',
    modelid: 'SML001',
    uniqueid: '00:17:88:01:03:44:55:66-02-0406',
    state: { presence: false, lastupdated: at },
    config: { on: true, reachable: true, battery: 80, duration: 60, sensitivity: 2 },
  },
  7: {
    name: 'Luminosité couloir',
    type: 'ZHALightLevel',
    manufacturername: 'Signify Netherlands B.V.',
    modelid: 'SML001',
    uniqueid: '00:17:88:01:03:44:55:66-02-0400',
    state: { lightlevel: 15052, lux: 32, dark: false, daylight: false, lastupdated: at },
    config: { on: true, reachable: true, battery: 80, tholddark: 12000, tholdoffset: 7000 },
  },
  8: {
    name: 'Température couloir',
    type: 'ZHATemperature',
    manufacturername: 'Signify Netherlands B.V.',
    modelid: 'SML001',
    uniqueid: '00:17:88:01:03:44:55:66-02-0402',
    state: { temperature: 1990, lastupdated: at },
    config: { on: true, reachable: true, battery: 80, offset: 0 },
  },
  9: {
    name: 'Fuite cuisine',
    type: 'ZHAWater',
    manufacturername: 'LUMI',
    modelid: 'lumi.sensor_wleak.aq1',
    uniqueid: '00:15:8d:00:05:66:77:88-01-0500',
    state: { water: false, lowbattery: false, tampered: false, lastupdated: at },
    config: { on: true, reachable: true, battery: 90 },
  },
  10: {
    name: 'Détecteur fumée',
    type: 'ZHAFire',
    manufacturername: 'LUMI',
    modelid: 'lumi.sensor_smoke',
    uniqueid: '00:15:8d:00:06:99:aa:bb-01-0500',
    state: { fire: false, lowbattery: false, lastupdated: at },
    config: { on: true, reachable: true, battery: 100 },
  },
  11: {
    name: 'Power 11',
    type: 'ZHAPower',
    manufacturername: 'LUMI',
    modelid: 'lumi.plug.maeu01',
    uniqueid: '00:15:8d:00:04:5a:6b:7c-15-0b04',
    state: { power: 1520, voltage: 231, current: 6580, lastupdated: at },
    config: { on: true, reachable: true },
  },
  12: {
    name: 'Consumption 12',
    type: 'ZHAConsumption',
    manufacturername: 'LUMI',
    modelid: 'lumi.plug.maeu01',
    uniqueid: '00:15:8d:00:04:5a:6b:7c-15-0702',
    state: { consumption: 123456, power: 1520, lastupdated: at },
    config: { on: true, reachable: true },
  },
  13: {
    name: 'Compteur maison',
    type: 'ZHAConsumption',
    manufacturername: 'Develco Products A/S',
    modelid: 'ZHEMI101',
    uniqueid: '00:15:bc:00:1a:00:00:01-02-0702',
    state: { consumption: 4567890, power: 850, lastupdated: at },
    config: { on: true, reachable: true },
  },
  14: {
    name: 'Radiateur salon',
    type: 'ZHAThermostat',
    manufacturername: 'Eurotronic',
    modelid: 'SPZB0001',
    uniqueid: '00:15:8d:00:01:aa:bb:cc-01-0201',
    state: { on: true, temperature: 2050, valve: 30, lastupdated: at },
    config: {
      heatsetpoint: 2100,
      mode: 'auto',
      offset: 0,
      battery: 70,
      on: true,
      reachable: true,
      locked: false,
    },
  },
  15: {
    name: 'Variateur Hue',
    type: 'ZHASwitch',
    manufacturername: 'Signify Netherlands B.V.',
    modelid: 'RWL021',
    uniqueid: '00:17:88:01:10:20:30:40-02-fc00',
    state: { buttonevent: 1002, lastupdated: at },
    config: { on: true, reachable: true, battery: 100 },
  },
  16: {
    name: 'Télécommande IKEA',
    type: 'ZHASwitch',
    manufacturername: 'IKEA of Sweden',
    modelid: 'TRADFRI remote control',
    uniqueid: '00:0b:57:ff:fe:aa:bb:cc-01-1000',
    state: { buttonevent: 2002, lastupdated: at },
    config: { on: true, reachable: true, battery: 87 },
  },
  17: {
    name: 'Vibration fenêtre',
    type: 'ZHAVibration',
    manufacturername: 'LUMI',
    modelid: 'lumi.vibration.aq1',
    uniqueid: '00:15:8d:00:07:12:34:56-01-0101',
    state: {
      vibration: false,
      tiltangle: 12,
      vibrationstrength: 9,
      orientation: [1, 2, 89],
      lastupdated: at,
    },
    config: { on: true, reachable: true, battery: 91, sensitivity: 11 },
  },
  18: {
    name: 'Détecteur CO',
    type: 'ZHACarbonMonoxide',
    manufacturername: 'Heiman',
    modelid: 'COSensor-EM',
    uniqueid: '00:0d:6f:00:08:aa:aa:aa-01-0500',
    state: { carbonmonoxide: false, lowbattery: false, lastupdated: at },
    config: { on: true, reachable: true },
  },
  19: {
    name: 'Batterie CO',
    type: 'ZHABattery',
    manufacturername: 'Heiman',
    modelid: 'COSensor-EM',
    uniqueid: '00:0d:6f:00:08:aa:aa:aa-01-0001',
    state: { battery: 64, lastupdated: at },
    config: { on: true, reachable: true },
  },
  20: {
    name: 'CLIP présence',
    type: 'CLIPPresence',
    modelid: 'CLIPPresence',
    uniqueid: 'clip-presence-1',
    state: { presence: false, lastupdated: 'none' },
    config: { on: true, reachable: true },
  },
  21: {
    name: 'Cube',
    type: 'ZHASwitch',
    manufacturername: 'LUMI',
    modelid: 'lumi.sensor_cube.aqgl01',
    uniqueid: '00:15:8d:00:09:cc:dd:ee-02-0012',
    state: { buttonevent: 3002, gesture: 3, lastupdated: at },
    config: { on: true, reachable: true, battery: 85 },
  },
  22: {
    name: 'Alarme',
    type: 'ZHAAlarm',
    manufacturername: 'Heiman',
    modelid: 'WarningDevice',
    uniqueid: '00:0d:6f:00:0b:12:34:56-01-0500',
    state: { alarm: false, lastupdated: at },
    config: { on: true, reachable: true },
  },
};

const IEEE = (uniqueid) => uniqueid.split('-')[0].replaceAll(':', '');

/** The external id of a device of the fixtures (selector of createFakeGladys). */
export const deviceId = (uniqueid) => `ext:test-integration:deconz:${IEEE(uniqueid)}`;

/** The external id of a feature of a resource. */
export const featureId = (uniqueid, key) => {
  const suffix = uniqueid.split('-').slice(1).join('-');
  return `${deviceId(uniqueid)}:${suffix ? `${suffix}:` : ''}${key}`;
};

/** A WebSocket event of the gateway. */
export const event = (e, r, id, extra = {}) => ({ t: 'event', e, r, id: String(id), ...extra });

/** The SSDP answer of a deCONZ gateway, as the Gladys core relays it. */
export const SSDP_DECONZ = {
  source_ip: HOST,
  source_port: 1900,
  headers: [
    'HTTP/1.1 200 OK',
    'HOST: 239.255.255.250:1900',
    'EXT:',
    'CACHE-CONTROL: max-age=100',
    `LOCATION: http://${HOST}:80/description.xml`,
    'SERVER: Linux/3.14.0 UPnP/1.0 IpBridge/1.26.0',
    'GWID.phoscon.de: 00212EFFFF0A1B2C',
    'hue-bridgeid: 00212EFFFF0A1B2C',
    'ST: urn:schemas-upnp-org:device:basic:1',
    'USN: uuid:2f402f80-da50-11e1-9b23-00212e0a1b2c::urn:schemas-upnp-org:device:basic:1',
  ].join('\r\n'),
};

/** The SSDP answer of a real Hue bridge: not a deCONZ gateway. */
export const SSDP_HUE = {
  source_ip: '192.168.1.30',
  source_port: 1900,
  headers: [
    'HTTP/1.1 200 OK',
    'LOCATION: http://192.168.1.30:80/description.xml',
    'SERVER: Hue/1.0 UPnP/1.0 IpBridge/1.65.0',
    'hue-bridgeid: ECB5FAFFFE123456',
    'ST: urn:schemas-upnp-org:device:basic:1',
  ].join('\r\n'),
};
