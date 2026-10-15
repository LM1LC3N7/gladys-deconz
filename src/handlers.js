// -----------------------------------------------------------------------------
// The SDK handlers, wired to the app. Shared by index.js and the end-to-end
// tests, so the tests run the exact wiring of the container.
// -----------------------------------------------------------------------------

import { ACTIONS } from './constants.js';

export function registerHandlers(gladys, app, logger) {
  // Discovery: the devices are published as soon as the gateway is read.
  gladys.onScanRequest(() => app.scanRequest());
  gladys.onDeviceCreated((device) => app.deviceCreated(device));
  gladys.onDeviceUpdated((device) => app.deviceCreated(device));
  gladys.onDeviceDeleted((device) => app.deviceDeleted(device));

  // Commands.
  gladys.onSetValue((device, feature, value) => app.setValue(device, feature, value));

  // Configuration screen buttons.
  gladys.onAction(ACTIONS.FIND, () => app.findGateway());
  gladys.onAction(ACTIONS.API_KEY, () => app.getApiKey());
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());

  // Configuration changed by the user (or saved by a button).
  gladys.onConfigUpdated((config) => {
    logger?.info('Configuration updated');
    return app.configure(config);
  });

  // Connection lifecycle.
  gladys.on('connected', async () => {
    try {
      await app.start(await gladys.getConfig());
    } catch (err) {
      logger?.error('Start failed', err);
    }
  });
}
