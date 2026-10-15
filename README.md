# gladys-deconz

[Gladys Assistant](https://gladysassistant.com) external integration for the
Zigbee devices of a **deCONZ / Phoscon** gateway (ConBee, RaspBee). It keeps a
ConBee/RaspBee setup working as it is, without moving to Zigbee2MQTT: it reads
the lights and sensors of the gateway through its local REST API, follows
their changes through its WebSocket, and sends the commands back.
Unofficial, not affiliated with dresden elektronik.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

> Work in progress (0.1, not published to the store yet): announced on the
> [Gladys forum](https://community.gladysassistant.com/t/integrations-home-assistant-les-plus-populaires-candidates-pour-des-integrations-externes-gladys/10385/159).

## How it works

```
Gladys ⇄ SDK ⇄ src/handlers.js ⇄ src/app.js (DeconzApp) ⇄ src/api.js ⇄ deCONZ (REST + WebSocket)
                                   ├─ src/resources.js  REST entries + WebSocket events -> resources (pure)
                                   ├─ src/mapping.js    one resource -> features, reader, writers (pure)
                                   ├─ src/devices.js    resources -> Gladys devices + routing tables (pure)
                                   ├─ src/buttons.js    buttonevent codes, cube gestures (pure)
                                   ├─ src/colors.js     xy / hue-sat <-> RGB integer (pure)
                                   ├─ src/discovery.js  SSDP answers -> deCONZ gateways (pure)
                                   └─ src/publisher.js  states within 300/min, button presses unmerged
```

- **Gateway**: typed by the user (`host`, `port`), or found by an SSDP scan the
  Gladys core runs (`network_discovery`, `gladys.scanNetwork('ssdp')`): deCONZ
  answers like a Hue bridge plus a `GWID.phoscon.de` header.
- **API key**: `POST /api` from the "Get an API key" button, within 60 s after
  "Authenticate app" in Phoscon; saved with `setConfig`.
- **Reading**: `GET /api/<key>/config` (name, version, `websocketport`), then
  the WebSocket; once it is open, `GET /lights` and `GET /sensors`. A full read
  again every 10 minutes and on every reconnection, an event of an unknown
  resource, or a scan request.
- **Devices**: one Gladys device per Zigbee IEEE address (the start of the
  `uniqueid`); feature ids `<device>:<uniqueid suffix>:<key>`, never the
  deCONZ REST ids (they change when a device is paired again).
- **Events**: `changed` events update the resources (`state`, `config`,
  `attr`, `name`); `added`, `deleted`, a rename or a new attribute rebuild the
  devices (debounced). A `buttonevent` with a new `lastupdated` is a press:
  the `button_event` scene trigger and the button feature.
- **Commands**: `onSetValue` -> the writer of the feature -> `PUT
/lights/<id>/state` or `PUT /sensors/<id>/config`; the WebSocket event that
  follows updates Gladys.
- **Liveness**: the WebSocket is pinged every 30 s, closed without pong,
  reconnected with a backoff (5 s to 1 min); reachability on the transport
  badges.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npm run audit
npx github:GladysAssistant/integration-store .  # store admission checks
```

`test/fixtures/gateway.js` holds REST answers and WebSocket events shaped like
the ones of a deCONZ 2.2x gateway (Hue, IKEA, Xiaomi, ubisys, Eurotronic...),
written from the deCONZ REST API documentation. The fakes of
`test/helpers/fakeDeconz.js` play the gateway; Gladys is the SDK's
`createFakeGladys`. Not yet run against a real ConBee: see [TODO.md](TODO.md).

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release. The
`gladys-assistant-integration` topic is added at the first real release only.

## Credits

Value conventions from the deCONZ REST plugin documentation (dresden
elektronik), cross-checked with the Home Assistant `deconz` integration and
pydeconz; no code copied. Color conversions follow the Gladys core.

## License

Apache-2.0.
