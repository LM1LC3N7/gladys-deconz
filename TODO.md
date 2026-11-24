# TODO — deCONZ / Phoscon v1

Handoff document: what is done, what was decided, what comes next. Keep it
up to date at the end of every milestone.

## Working method

- One milestone at a time, one commit per milestone, tests green before moving on.
- After each milestone: `npm run format:check`, `npm run lint`, `npm test`,
  `npm run audit`, then update README, `docs/en.md`, `docs/fr.md`,
  `CHANGELOG.md` and this file.
- The `gladys-assistant-integration` topic is added at the first real release
  only (before, the store would list an empty integration).

## Status

- [x] **Milestone 1 — core** (2026-10-15): REST client, WebSocket (ping,
      backoff, full read on reconnection), SSDP discovery through
      `scanNetwork`, API key button, connection test, one device per IEEE
      address, lights (on, bri, ct, xy/hs color), plugs/relays, covers (lift),
      thermostats (setpoint, mode, activity), 15 sensor types, battery,
      remotes (`button_event` trigger + button feature, cube, Hue Tap),
      reachability badges, manifest, docs en/fr. 74 unit tests, fixtures only.
- [ ] **Milestone 2 — real gateway**: run against a ConBee II / RaspBee with
      deCONZ 2.2x (see below); collect `GET /lights` and `GET /sensors`
      answers from testers as fixtures; fix what differs.
- [ ] **Milestone 3 — more of deCONZ**: groups as lights, `scene-called` and
      recalling deCONZ scenes (scene action), door locks (`Door Lock`),
      sirens (`Warning device` + `ZHAAlarm`), fans (`state.speed`), legacy
      covers (`bri`, "Level controllable output"), cover tilt, thermostat
      presets and `coolsetpoint`, `ZHACarbonDioxide`/`ZHAParticulateMatter`,
      per-button features for known remote models.
- [ ] **Milestone 4 — first release**: cover image (800×534), Docker image
      build check, `npx github:GladysAssistant/integration-store .`, Release
      workflow, topic, GHCR package public.

## To check on a real gateway (needs a ConBee/RaspBee)

- `POST /api` after "Authenticate app" (Phoscon wording in French and English).
- The SSDP answer through the Gladys core (`GWID.phoscon.de`), Docker setups.
- WebSocket port (443, 8081, or the HTTP port on recent builds), pings answered.
- `websocketnotifyall` true and false: button presses not doubled nor lost.
- Real color round trip on a Hue / IKEA / Tuya bulb (xy vs hs lights).
- Covers: direction of `lift` on several brands, stop.
- Thermostat modes accepted by Eurotronic, Danfoss Ally, Tuya valves.
- Hue dimmer (1000/1002/1001/1003), IKEA remotes, Aqara Opple, cube.

## Forum

No dedicated topic for this integration. Once the 10 integrations claimed on
2026-10-15 are published, a single recap message in the general thread
(/t/10385) lists each of them with its version and capabilities.

## Next patch

- Min/max test: add a meter alone (ZHAPower/ZHAConsumption with voltage and
  current, no plug) so `energy-sensor/voltage` and `/current` are built; count
  the features exactly instead of `seen.size >= 31` (review w10 r1, minors 2-3).
- Strict writes: thermostat mode refused when not in the feature's
  `supported_options` (and `''`/`1.4` not rounded); cover position refused when
  not a number (minor 4).
- Strip `config.apiKey` from a gateway error description before it reaches a
  status or a log (minor 5, theoretical). `LICENSE` file (cross-repo pass).
- To decide (Louis): thermostat setpoint and mode are sent without an option,
  like the other bridges (only homee has `allow_heating_control`).

## Decisions

- **SDK `^0.16.1`** (2026-11-24, migration wave 10): it adds the ai, tts and
  music types, and its fake Gladys refuses a feature without a name, boolean
  `read_only`/`has_feedback` or finite `min`/`max`; no effect here
  (`poll_frequency` unused, the devices carry `should_poll: false`). Every
  feature already conformed; `test/helpers/coreFeature.js` now checks each one
  against the core model (test/devices.test.js). `npm test` runs with
  `--test-timeout=60000`. The fixture gateway plus a few synthetic resources
  reach every mapping branch (31 kinds of features). `keywords`, `countries` and
  `gladys_version >= 5.3.0` wait until Gladys 5.3 is widespread.
- One Gladys device per Zigbee IEEE address; feature ids from the `uniqueid`
  suffix, so a device paired again keeps its ids even if its REST id changes.
- "On/Off light", "On/Off output", plugs: `switch` category, like Home
  Assistant and the core Zigbee2MQTT relays.
- Power/energy of a device that has a light or a plug: `switch` features; a
  standalone meter's: `energy-sensor` (energy as an `index`). The power of a
  ZHAConsumption next to a ZHAPower is left out (same value twice).
- Commands are not optimistic: the WebSocket event that follows a PUT updates
  Gladys. Brightness, color temperature and color also turn the light on
  (deCONZ refuses them on a light that is off).
- A press = a `buttonevent` event with a new `lastupdated`; button states go
  through `publishStates` (two identical presses are two states).
- No mDNS: deCONZ does not announce itself over mDNS; SSDP only.
- The device list is published again only when it changed, or on a Gladys scan
  request / a restart.
- The setConfig of the buttons comes back through `onConfigUpdated`:
  `configure()` only reconnects when the host, port or key changed.

## Next patch

- Migration review minors: see `_lots/migration-reviews/w10-gladys-deconz-r2.md`.
