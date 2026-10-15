// -----------------------------------------------------------------------------
// ZHASwitch / ZGPSwitch button events (pure).
//
// deCONZ reports a remote or a wall switch as `state.buttonevent` = xxxx:
// button * 1000 + event. 1002 is "button 1, short release" (the usual click),
// 2001 "button 2, hold", 3004 "button 3, double press"... Two exceptions:
// - the Aqara cube says what happened in `state.gesture` (its buttonevent is
//   the side, or the rotation angle * 100);
// - the Hue Tap (ZGPSwitch) sends raw codes 34, 16, 17, 18 for its 4 buttons.
// The event numbers come from the deCONZ REST plugin documentation ("Button
// events"); the Gladys values from the core BUTTON_STATUS
// (server/utils/constants.js), the ones its Matter and Zigbee2MQTT services
// use for the same gestures.
// -----------------------------------------------------------------------------

/** Gladys core BUTTON_STATUS values used here. */
export const BUTTON_STATUS = {
  TRIPLE: 18,
  QUADRUPLE: 19,
  MANY: 21,
  SHAKE: 22,
  WAKEUP: 24,
  TAP: 26,
  SLIDE: 27,
  FLIP_180: 28,
  FLIP_90: 29,
  ROTATE_LEFT: 30,
  ROTATE_RIGHT: 31,
  TILT: 33,
  DROP: 34,
  INITIAL_PRESS: 47,
  LONG_PRESS: 48,
  SHORT_RELEASE: 49,
  LONG_RELEASE: 50,
  DOUBLE_PRESS: 51,
};

const S = BUTTON_STATUS;

/** deCONZ event number (buttonevent % 1000) -> name and Gladys button status. */
export const BUTTON_EVENTS = new Map([
  [0, ['initial_press', S.INITIAL_PRESS]],
  [1, ['hold', S.LONG_PRESS]],
  [2, ['short_release', S.SHORT_RELEASE]],
  [3, ['long_release', S.LONG_RELEASE]],
  [4, ['double_press', S.DOUBLE_PRESS]],
  [5, ['triple_press', S.TRIPLE]],
  [6, ['quadruple_press', S.QUADRUPLE]],
  [7, ['shake', S.SHAKE]],
  [8, ['drop', S.DROP]],
  [9, ['tilt', S.TILT]],
  [10, ['many_press', S.MANY]],
  [30, ['rotate_cw', S.ROTATE_RIGHT]],
  [31, ['rotate_ccw', S.ROTATE_LEFT]],
]);

/** Aqara cube `state.gesture` -> name and Gladys button status. */
export const CUBE_GESTURES = new Map([
  [0, ['wake', S.WAKEUP]],
  [1, ['shake', S.SHAKE]],
  [2, ['drop', S.DROP]],
  [3, ['flip_90', S.FLIP_90]],
  [4, ['flip_180', S.FLIP_180]],
  [5, ['push', S.SLIDE]],
  [6, ['double_tap', S.TAP]],
  [7, ['rotate_cw', S.ROTATE_RIGHT]],
  [8, ['rotate_ccw', S.ROTATE_LEFT]],
]);

/** Hue Tap raw codes -> button number (each one is a click). */
const HUE_TAP = new Map([
  [34, 1],
  [16, 2],
  [17, 3],
  [18, 4],
]);

/** Every Gladys value a button feature can take. */
export const BUTTON_VALUES = [
  ...new Set([...BUTTON_EVENTS.values(), ...CUBE_GESTURES.values()].map(([, status]) => status)),
].sort((a, b) => a - b);

/**
 * Decodes the state of a button resource after a press.
 * 2003 -> { code: 2003, button: 2, event: 'long_release', status: 50 }.
 * An event deCONZ documents no name for keeps `event` = `event_<n>` and no
 * status: the scene trigger still fires, the button feature is left alone.
 * @param {object} state the `state` of the resource (buttonevent, gesture)
 * @param {string} [type] the resource type (ZHASwitch, ZGPSwitch)
 * @returns {{ code: number, button: number | null, event: string, status?: number } | undefined}
 */
export function decodeButtonEvent(state, type) {
  const code = Number(state?.buttonevent);
  if (!Number.isInteger(code)) {
    return undefined;
  }
  const gesture = state?.gesture;
  if (Number.isInteger(gesture) && CUBE_GESTURES.has(gesture)) {
    const [event, status] = CUBE_GESTURES.get(gesture);
    // Rotations carry the angle * 100 in buttonevent: no side then.
    const button = gesture >= 7 ? null : Math.floor(Math.abs(code) / 1000) || null;
    return { code, button, event, status };
  }
  if (type === 'ZGPSwitch' && HUE_TAP.has(code)) {
    return { code, button: HUE_TAP.get(code), event: 'short_release', status: S.SHORT_RELEASE };
  }
  if (code < 1000) {
    return { code, button: null, event: `event_${code}` };
  }
  const button = Math.floor(code / 1000);
  const known = BUTTON_EVENTS.get(code % 1000);
  return known
    ? { code, button, event: known[0], status: known[1] }
    : { code, button, event: `event_${code % 1000}` };
}
