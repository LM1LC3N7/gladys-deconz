# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Changed

- README: the store install note replaces the work-in-progress notice, and the
  Releasing section no longer says the store topic is still to be added.

## [0.1.1] - 2026-10-15

### Added

- Connection to a deCONZ / Phoscon gateway (ConBee, RaspBee) through its local
  REST API, and its WebSocket for the live changes (pinged, reconnected with a
  backoff, everything read again on reconnection).
- "Find the gateway" button and automatic search when no address is typed: an
  SSDP scan run by Gladys (`network_discovery`), a deCONZ gateway told from a
  Hue bridge by its `GWID.phoscon.de` header.
- "Get an API key" button (after "Authenticate app" in Phoscon) and "Test the
  connection" button.
- One Gladys device per Zigbee device: its lights and sensors (same IEEE
  address) become its features, with one battery.
- Lights (on/off, brightness, color temperature in mireds, color from xy or
  hue/saturation), plugs and relays, window coverings (state and position).
- Sensors: temperature, humidity, pressure, opening, motion, water leak,
  smoke, carbon monoxide, illuminance, power, voltage, current, energy,
  vibration and tilt angle, soil moisture, VOC, battery.
- Thermostats: temperature, setpoint, mode and heating activity.
- Remotes and wall switches: a button feature and the "deCONZ remote button"
  scene trigger (button number, gesture, raw code), Aqara cube gestures and Hue
  Tap codes included.
- The reachability of the devices on their transport badge.
- States within the Gladys rate limit; button presses never merged.

[Unreleased]: https://github.com/LM1LC3N7/gladys-deconz/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-deconz/releases/tag/v0.1.1
