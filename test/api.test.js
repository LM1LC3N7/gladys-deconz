// The REST client against a fake fetch: URLs, bodies and the deCONZ errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeconzError, createRestClient, networkReason } from '../src/api.js';

function fakeFetch(answer) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    const { status = 200, body } = typeof answer === 'function' ? answer(url, init) : answer;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
  return { fetch, calls };
}

const CONFIG = { host: '192.168.1.20', port: 8080, apiKey: 'A1B2C3D4E5' };

test('GET and PUT with the key in the path', async () => {
  const { fetch, calls } = fakeFetch({ body: { 1: { name: 'Salon' } } });
  const client = createRestClient(CONFIG, { fetch });
  assert.deepEqual(await client.getLights(), { 1: { name: 'Salon' } });
  await client.getSensors();
  await client.getConfig();
  await client.put('/lights/1/state', { on: true });
  assert.deepEqual(
    calls.map((c) => [c.method, c.url]),
    [
      ['GET', 'http://192.168.1.20:8080/api/A1B2C3D4E5/lights'],
      ['GET', 'http://192.168.1.20:8080/api/A1B2C3D4E5/sensors'],
      ['GET', 'http://192.168.1.20:8080/api/A1B2C3D4E5/config'],
      ['PUT', 'http://192.168.1.20:8080/api/A1B2C3D4E5/lights/1/state'],
    ],
  );
  assert.deepEqual(calls[3].body, { on: true });
});

test('the API key: created, or the gateway is locked', async () => {
  const ok = fakeFetch({ body: [{ success: { username: '988112A4E1' } }] });
  assert.equal(
    await createRestClient(CONFIG, { fetch: ok.fetch }).createApiKey('gladys-deconz'),
    '988112A4E1',
  );
  assert.deepEqual(ok.calls[0], {
    url: 'http://192.168.1.20:8080/api',
    method: 'POST',
    body: { devicetype: 'gladys-deconz' },
  });
  const locked = fakeFetch({
    status: 403,
    body: [{ error: { type: 101, address: '/', description: 'link button not pressed' } }],
  });
  await assert.rejects(
    createRestClient(CONFIG, { fetch: locked.fetch }).createApiKey('gladys-deconz'),
    (err) => err instanceof DeconzError && err.reason === 'locked' && err.type === 101,
  );
  const empty = fakeFetch({ body: [] });
  await assert.rejects(createRestClient(CONFIG, { fetch: empty.fetch }).createApiKey('x'), {
    reason: 'invalid',
  });
});

test('deCONZ errors: refused key, error inside a 200, not JSON', async () => {
  const unauthorized = fakeFetch({
    status: 403,
    body: [{ error: { type: 1, address: '/lights', description: 'unauthorized user' } }],
  });
  await assert.rejects(createRestClient(CONFIG, { fetch: unauthorized.fetch }).getLights(), {
    reason: 'unauthorized',
    message: 'deCONZ: unauthorized user',
  });
  const unreachable = fakeFetch({
    body: [
      {
        error: {
          type: 202,
          address: '/lights/3/state',
          description: 'Could not set attribute. Device is not reachable.',
        },
      },
    ],
  });
  await assert.rejects(
    createRestClient(CONFIG, { fetch: unreachable.fetch }).put('/lights/3/state', { on: true }),
    { reason: 'refused', type: 202 },
  );
  const html = fakeFetch({ status: 502, body: '<html>Bad gateway</html>' });
  await assert.rejects(createRestClient(CONFIG, { fetch: html.fetch }).getConfig(), {
    reason: 'invalid',
    message: 'not a deCONZ answer (HTTP 502)',
  });
  const server = fakeFetch({ status: 503, body: '' });
  await assert.rejects(createRestClient(CONFIG, { fetch: server.fetch }).getConfig(), {
    message: 'HTTP 503',
  });
});

test('a network error says why, never with the key', async () => {
  const fetch = async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  };
  await assert.rejects(createRestClient(CONFIG, { fetch }).getConfig(), (err) => {
    assert.equal(err.reason, 'unreachable');
    assert.equal(err.message, 'ECONNREFUSED');
    assert.ok(!err.message.includes(CONFIG.apiKey));
    return true;
  });
  assert.equal(networkReason(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'timeout');
  assert.equal(networkReason(new Error('x')), 'network error');
});
