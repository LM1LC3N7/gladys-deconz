// -----------------------------------------------------------------------------
// Finding the gateway on the LAN (pure): the raw results of the SSDP scan the
// Gladys core runs for the integration (`gladys.scanNetwork('ssdp')`, the
// container itself cannot multicast).
//
// deCONZ answers M-SEARCH like a Hue bridge (`hue-bridgeid`, `IpBridge`), plus
// a `GWID.phoscon.de` header with its gateway id: that header tells it from a
// real Hue bridge. Without it, a `hue-bridgeid` starting with 00212E (the
// dresden elektronik OUI of the ConBee/RaspBee) is accepted too; a Hue bridge
// (001788, ECB5FA) never matches.
// -----------------------------------------------------------------------------

const DECONZ_OUI = '00212E';

/** The raw headers of an SSDP answer -> { lowercase name: value }. */
export function parseHeaders(text) {
  const headers = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) {
      const name = line.slice(0, i).trim().toLowerCase();
      if (!(name in headers)) {
        headers[name] = line.slice(i + 1).trim();
      }
    }
  }
  return headers;
}

/**
 * The deCONZ gateways among SSDP answers, one per gateway id.
 * @param {{ source_ip: string, headers: string }[]} results
 * @returns {{ id: string, host: string, port: number }[]}
 */
export function gatewaysFromSsdp(results) {
  const found = new Map();
  for (const result of Array.isArray(results) ? results : []) {
    const headers = parseHeaders(result?.headers);
    const gwid = String(headers['gwid.phoscon.de'] ?? '').toUpperCase();
    const bridgeId = String(headers['hue-bridgeid'] ?? '').toUpperCase();
    const id = gwid || (bridgeId.startsWith(DECONZ_OUI) ? bridgeId : '');
    if (!/^[0-9A-F]{12,16}$/.test(id)) {
      continue;
    }
    let host = typeof result.source_ip === 'string' ? result.source_ip : '';
    let port = 80;
    try {
      const location = new URL(headers.location);
      host = location.hostname || host;
      port = Number(location.port) || 80;
    } catch {
      // No usable LOCATION: the address that answered, on port 80.
    }
    if (host && !found.has(id)) {
      found.set(id, { id, host, port });
    }
  }
  return [...found.values()];
}
