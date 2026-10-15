import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUTTON_STATUS as S, BUTTON_VALUES, decodeButtonEvent } from '../src/buttons.js';

const decode = (buttonevent, extra = {}, type = 'ZHASwitch') =>
  decodeButtonEvent({ buttonevent, ...extra }, type);

test('button * 1000 + event', () => {
  assert.deepEqual(decode(1002), {
    code: 1002,
    button: 1,
    event: 'short_release',
    status: S.SHORT_RELEASE,
  });
  assert.deepEqual(decode(2001), { code: 2001, button: 2, event: 'hold', status: S.LONG_PRESS });
  assert.equal(decode(3000).event, 'initial_press');
  assert.equal(decode(3003).status, S.LONG_RELEASE);
  assert.equal(decode(5004).status, S.DOUBLE_PRESS);
  assert.equal(decode(1005).status, S.TRIPLE);
  assert.equal(decode(1006).status, S.QUADRUPLE);
  assert.equal(decode(1010).status, S.MANY);
  assert.equal(decode(1030).event, 'rotate_cw');
  assert.equal(decode(1031).status, S.ROTATE_LEFT);
});

test('an event deCONZ documents no name for still has a button and a code', () => {
  assert.deepEqual(decode(2042), { code: 2042, button: 2, event: 'event_42' });
  assert.deepEqual(decode(98, {}, 'ZGPSwitch'), { code: 98, button: null, event: 'event_98' });
  assert.equal(decode(undefined), undefined);
  assert.equal(decode('abc'), undefined);
});

test('the Hue Tap raw codes', () => {
  assert.deepEqual(decode(34, {}, 'ZGPSwitch'), {
    code: 34,
    button: 1,
    event: 'short_release',
    status: S.SHORT_RELEASE,
  });
  assert.equal(decode(18, {}, 'ZGPSwitch').button, 4);
});

test('the Aqara cube gestures', () => {
  assert.deepEqual(decode(7007, { gesture: 1 }), {
    code: 7007,
    button: 7,
    event: 'shake',
    status: S.SHAKE,
  });
  assert.deepEqual(decode(2003, { gesture: 3 }), {
    code: 2003,
    button: 2,
    event: 'flip_90',
    status: S.FLIP_90,
  });
  assert.equal(decode(5000, { gesture: 5 }).status, S.SLIDE);
  assert.equal(decode(6006, { gesture: 6 }).status, S.TAP);
  assert.deepEqual(decode(4523, { gesture: 7 }), {
    code: 4523,
    button: null,
    event: 'rotate_cw',
    status: S.ROTATE_RIGHT,
  });
});

test('the Gladys values of a button feature, sorted', () => {
  assert.deepEqual(
    BUTTON_VALUES,
    [...BUTTON_VALUES].sort((a, b) => a - b),
  );
  assert.ok(BUTTON_VALUES.includes(S.SHORT_RELEASE) && BUTTON_VALUES.includes(S.WAKEUP));
});
