import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEvent,
  parseCollection,
  parseUniqueId,
  reachableOf,
  toResource,
} from '../src/resources.js';
import { LIGHTS, SENSORS, event } from './fixtures/gateway.js';

test('the IEEE address and the suffix of a uniqueid', () => {
  assert.deepEqual(parseUniqueId('00:15:8D:00:02:34:56:78-01-0402'), {
    mac: '00158d0002345678',
    suffix: '01-0402',
  });
  assert.deepEqual(parseUniqueId('00:17:88:01:08:1a:2b:3c-0b'), {
    mac: '00178801081a2b3c',
    suffix: '0b',
  });
  assert.deepEqual(parseUniqueId('00:17:88:01:08:1a:2b:3c'), {
    mac: '00178801081a2b3c',
    suffix: '',
  });
  assert.equal(parseUniqueId('clip-presence-1'), undefined);
  assert.equal(parseUniqueId(undefined), undefined);
});

test('the REST collections become resources', () => {
  const lights = parseCollection('lights', LIGHTS);
  assert.equal(lights.length, Object.keys(LIGHTS).length);
  const salon = lights.find((r) => r.id === '2');
  assert.equal(salon.key, 'lights/2');
  assert.equal(salon.mac, '00178801081a2b3c');
  assert.equal(salon.suffix, '0b');
  assert.equal(parseCollection('sensors', null).length, 0);
  assert.equal(parseCollection('groups', LIGHTS).length, 0, 'groups are not followed');
  assert.equal(toResource('sensors', 1, { type: 'ZHASwitch' }).name, 'sensors 1');
});

test('WebSocket events: changed (state, config, attr, name), added, deleted', () => {
  const resources = new Map(parseCollection('sensors', SENSORS).map((r) => [r.key, r]));
  const changed = applyEvent(
    resources,
    event('changed', 'sensors', 2, { state: { temperature: 2300 }, config: { battery: 50 } }),
  );
  assert.equal(changed.type, 'changed');
  assert.equal(changed.before.state.temperature, 2154);
  assert.equal(resources.get('sensors/2').state.temperature, 2300);
  assert.equal(resources.get('sensors/2').state.lastupdated, SENSORS[2].state.lastupdated);
  assert.equal(resources.get('sensors/2').config.battery, 50);

  applyEvent(resources, event('changed', 'sensors', 2, { attr: { name: 'Bureau', id: 'x' } }));
  assert.equal(resources.get('sensors/2').name, 'Bureau');
  assert.equal(resources.get('sensors/2').id, '2', 'the identity is never overwritten');
  applyEvent(resources, event('changed', 'sensors', 2, { name: 'Bureau 2' }));
  assert.equal(resources.get('sensors/2').name, 'Bureau 2');

  const added = applyEvent(
    resources,
    event('added', 'sensors', 40, { sensor: { type: 'ZHAWater', uniqueid: 'aa' } }),
  );
  assert.equal(added.type, 'added');
  assert.equal(applyEvent(resources, event('deleted', 'sensors', 40)).type, 'deleted');
  assert.equal(applyEvent(resources, event('deleted', 'sensors', 40)).type, 'ignored');
  assert.equal(applyEvent(resources, event('changed', 'sensors', 99, {})).type, 'unknown');
  assert.equal(applyEvent(resources, event('added', 'sensors', 41, {})).type, 'unknown');
  assert.equal(
    applyEvent(resources, { t: 'event', e: 'scene-called', r: 'scenes', gid: '1', scid: '2' }).type,
    'ignored',
  );
  assert.equal(applyEvent(resources, 'nonsense').type, 'ignored');
});

test('reachability: state of a light, config of a sensor', () => {
  assert.equal(reachableOf(toResource('lights', 1, { state: { reachable: false } })), false);
  assert.equal(reachableOf(toResource('sensors', 1, { config: { reachable: true } })), true);
  assert.equal(reachableOf(toResource('sensors', 1, { state: { reachable: true } })), undefined);
});
