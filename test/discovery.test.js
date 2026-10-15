import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gatewaysFromSsdp, parseHeaders } from '../src/discovery.js';
import { SSDP_DECONZ, SSDP_HUE } from './fixtures/gateway.js';

test('SSDP headers, case-insensitive names', () => {
  const headers = parseHeaders(SSDP_DECONZ.headers);
  assert.equal(headers['gwid.phoscon.de'], '00212EFFFF0A1B2C');
  assert.equal(headers.location, 'http://192.168.1.20:80/description.xml');
  assert.deepEqual(parseHeaders(undefined), {});
});

test('the deCONZ gateways, not the Hue bridges, one per gateway', () => {
  assert.deepEqual(gatewaysFromSsdp([SSDP_HUE, SSDP_DECONZ, SSDP_DECONZ]), [
    { id: '00212EFFFF0A1B2C', host: '192.168.1.20', port: 80 },
  ]);
  assert.deepEqual(gatewaysFromSsdp(null), []);
});

test('an older deCONZ without GWID header, a gateway on another port', () => {
  const old = {
    source_ip: '192.168.1.21',
    headers: 'LOCATION: http://192.168.1.21:8080/description.xml\r\nhue-bridgeid: 00212EFFFF001122',
  };
  assert.deepEqual(gatewaysFromSsdp([old]), [
    { id: '00212EFFFF001122', host: '192.168.1.21', port: 8080 },
  ]);
  const noLocation = { source_ip: '192.168.1.22', headers: 'GWID.phoscon.de: 00212EFFFF003344' };
  assert.deepEqual(gatewaysFromSsdp([noLocation]), [
    { id: '00212EFFFF003344', host: '192.168.1.22', port: 80 },
  ]);
});
