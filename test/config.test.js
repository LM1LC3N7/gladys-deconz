import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionKey, normalizeConfig, parseHost } from '../src/config.js';

test('the gateway address, as users type it', () => {
  assert.deepEqual(parseHost('192.168.1.20'), { host: '192.168.1.20' });
  assert.deepEqual(parseHost(' phoscon.lan '), { host: 'phoscon.lan' });
  assert.deepEqual(parseHost('192.168.1.20:8080'), { host: '192.168.1.20', port: 8080 });
  assert.deepEqual(parseHost('http://192.168.1.20:8080/pwa/index.html'), {
    host: '192.168.1.20',
    port: 8080,
  });
  assert.deepEqual(parseHost(''), { error: 'empty' });
  assert.deepEqual(parseHost(null), { error: 'empty' });
  for (const bad of ['https://host', 'http://user:pw@host', '999.1.1.1', 'a b', 'ws://host']) {
    assert.deepEqual(parseHost(bad), { error: 'invalid' }, bad);
  }
});

test('the configuration, normalized', () => {
  assert.deepEqual(normalizeConfig(), {
    host: undefined,
    hostError: 'empty',
    port: 80,
    apiKey: '',
  });
  assert.deepEqual(normalizeConfig({ host: '10.0.0.5', port: '8080', api_key: ' KEY ' }), {
    host: '10.0.0.5',
    hostError: undefined,
    port: 8080,
    apiKey: 'KEY',
  });
  assert.equal(normalizeConfig({ host: '10.0.0.5:8090', port: 80 }).port, 8090, 'the address wins');
  assert.equal(normalizeConfig({ host: '10.0.0.5', port: 0 }).port, 80);
  assert.equal(normalizeConfig({ host: '10.0.0.5', port: null }).port, 80);
});

test('the connection key changes with the address, the port or the key', () => {
  const a = normalizeConfig({ host: '10.0.0.5', api_key: 'K' });
  assert.equal(
    connectionKey(a),
    connectionKey(normalizeConfig({ host: '10.0.0.5:80', api_key: 'K' })),
  );
  assert.notEqual(
    connectionKey(a),
    connectionKey(normalizeConfig({ host: '10.0.0.5', api_key: 'L' })),
  );
});
