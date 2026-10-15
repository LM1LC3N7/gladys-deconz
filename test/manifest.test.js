// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUTTON_EVENTS, CUBE_GESTURES } from '../src/buttons.js';
import { DEFAULTS } from '../src/config.js';
import { ACTIONS, SCENE_TRIGGERS, SSDP_ST } from '../src/constants.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const handlers = read('src/handlers.js');
const app = read('src/app.js');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, entry] of node.entries()) {
      yield* texts(entry, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

test('the store basics', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'device');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  assert.match(manifest.gladys_version, /^>=5\.1\.0$/, 'scene triggers need Gladys 5.1');
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-deconz:${manifest.version}`);
  assert.equal(manifest.version, JSON.parse(read('package.json')).version);
  assert.deepEqual(manifest.transports, ['local']);
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    assert.ok(read(`docs/${lang}.md`).length >= 300, `docs/${lang}.md is too short for the store`);
  }
});

test('every text is in English and French', () => {
  for (const [path, text] of texts(manifest)) {
    for (const lang of ['en', 'fr']) {
      assert.ok(text[lang]?.trim(), `${path} needs ${lang}`);
    }
  }
});

test('the configuration matches the code', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.ok(fields[key], `${key} is not in the config_schema`);
    if (fields[key].default !== undefined || !['', null].includes(value)) {
      assert.deepEqual(fields[key].default, value, key);
    }
  }
  assert.equal(fields.api_key.type, 'secret');
  assert.equal(fields.host.required, false, 'an empty address means: look for the gateway');
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    for (const lang of ['en', 'fr']) {
      assert.ok(section.description[lang].length <= 1000, `${section.key}.${lang} too long`);
    }
    assert.ok((section.links ?? []).every((l) => l.url.startsWith('https://')));
    assert.ok((section.links ?? []).length <= 5);
  }
  for (const field of manifest.config_schema.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', `${field.key}: multi-language placeholder`);
  }
});

test('the keys of the manifest are the keys of the code', () => {
  assert.deepEqual(manifest.actions.map((a) => a.key).sort(), Object.values(ACTIONS).sort());
  for (const name of Object.keys(ACTIONS)) {
    assert.ok(handlers.includes(`onAction(ACTIONS.${name}`), `ACTIONS.${name} has no handler`);
  }
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(manifest.network_discovery, [{ type: 'ssdp', st: SSDP_ST }]);
  assert.match(app, /scanNetwork\('ssdp'/);
});

test('the button trigger: its fields and variables are what the events carry', () => {
  const trigger = manifest.scene_triggers.find((t) => t.key === SCENE_TRIGGERS.BUTTON);
  assert.deepEqual(
    trigger.fields.map((f) => f.key),
    ['device', 'button', 'event'],
  );
  assert.deepEqual(
    trigger.variables.map((v) => v.key),
    ['button', 'event', 'code', 'gesture'],
  );
  // The data object of publishSceneEvent in src/app.js.
  const sent = /publishSceneEvent\(SCENE_TRIGGERS\.BUTTON, \{([\s\S]*?)\}\)/.exec(app)[1];
  for (const key of ['device', 'button', 'event', 'code', 'gesture']) {
    assert.match(sent, new RegExp(`(^|\\s)${key}:`), `${key} is never sent`);
  }
  const device = trigger.fields.find((f) => f.key === 'device');
  assert.equal(device.source, 'devices');
  // Every named gesture can be picked, and nothing else.
  const names = new Set(
    [...BUTTON_EVENTS.values(), ...CUBE_GESTURES.values()].map(([name]) => name),
  );
  const options = trigger.fields.find((f) => f.key === 'event').options.map((o) => o.value);
  assert.deepEqual(new Set(options), names);
});
