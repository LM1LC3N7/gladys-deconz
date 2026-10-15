# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors. Read **[TODO.md](./TODO.md) first**: status, decisions
already taken and the next milestones.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15). It
connects to the user's deCONZ / Phoscon gateway (ConBee, RaspBee) through its
REST API and WebSocket, and turns its lights and sensors into Gladys devices,
states, commands and a `button_event` scene trigger. Unofficial, not
affiliated with dresden elektronik.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js            SDK bootstrap only
src/handlers.js     every SDK handler -> the app (shared with the tests)
src/app.js          DeconzApp: gateway lifecycle, WebSocket, events,
                    commands, buttons, transports, the three buttons
src/api.js          the only network access (fetch + ws)
src/resources.js    REST entries and WebSocket events -> resources (pure)
src/mapping.js      one resource -> features, reader, writers (pure)
src/devices.js      resources -> Gladys devices + routing tables (pure)
src/buttons.js      buttonevent codes, cube gestures, Hue Tap (pure)
src/colors.js       xy / hue-sat <-> RGB integer (pure)
src/discovery.js    SSDP answers -> deCONZ gateways (pure)
src/publisher.js    states within the Gladys rate limit
src/config.js       config_schema normalized
src/constants.js    manifest keys, limits, timings
src/i18n.js         runtime texts (en/fr)
test/fixtures/      REST answers and events shaped like a real gateway
test/helpers/       a fake gateway (REST client + WebSocket); Gladys is the SDK's fake
```

## Rules

- **External ids are forever**: device = `deconz:<IEEE address>`, feature =
  `<device>:<uniqueid suffix>:<key>`, battery = `<device>:battery`. Never build
  them from the deCONZ REST ids, never change how they are built.
- Manifest keys (`find_gateway`, `get_api_key`, `test_connection`,
  `button_event` and its fields, the gesture names) are frozen: users store them.
- Value conventions are the Gladys core ones (`server/utils/constants.js`, the
  Zigbee2MQTT service): opening sensor 1 = closed, cover position 100 = open,
  brightness 0-255, color temperature in mireds, color as an RGB integer.
- Container limits: 256 MB RAM, 0.5 CPU, read-only rootfs, only `/data`
  writable, bridge network (unicast to the gateway is fine; SSDP only through
  `gladys.scanNetwork`).
- Gladys rate limits: 300 states/min, 300 scene events/min.
- Never log or put in a status message the API key (it is in the REST path:
  log paths relative to the key only).
- Tests never touch the network: fixtures + fakes.
- Code, comments, README in English; `docs/en.md` and `docs/fr.md` kept in sync.
