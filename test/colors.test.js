import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hueSatToInt, intToHueSat, intToRgb, intToXy, rgbToInt, xyToInt } from '../src/colors.js';

const distance = (a, b) => {
  const [r1, g1, b1] = intToRgb(a);
  const [r2, g2, b2] = intToRgb(b);
  return Math.max(Math.abs(r1 - r2), Math.abs(g1 - g2), Math.abs(b1 - b2));
};

test('RGB integers', () => {
  assert.equal(rgbToInt([255, 128, 0]), 0xff8000);
  assert.deepEqual(intToRgb(0x12abef), [0x12, 0xab, 0xef]);
});

test('xy -> RGB like the Gladys core (Wide gamut, sRGB gamma, normalized)', () => {
  assert.equal(xyToInt(0.7006, 0.2993), 0xff0000);
  // The white point of the gamut is white.
  assert.ok(distance(xyToInt(0.3227, 0.329), 0xffffff) <= 8);
  assert.equal(xyToInt(0.3, 0), undefined);
  assert.equal(xyToInt(Number.NaN, 0.3), undefined);
});

test('RGB -> xy -> RGB keeps the color (xy has no brightness: full ones)', () => {
  for (const color of [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0x00ffff, 0xff8800, 0x8040ff]) {
    const [x, y] = intToXy(color);
    assert.ok(distance(xyToInt(x, y), color) <= 6, color.toString(16));
  }
  assert.deepEqual(intToXy(0), [0.3227, 0.329], 'black: the white point');
});

test('hue/sat <-> RGB, the brightness left out', () => {
  assert.equal(hueSatToInt(0, 255), 0xff0000);
  assert.equal(hueSatToInt(21845, 255), 0x00ff00);
  assert.equal(hueSatToInt(43690, 255), 0x0000ff);
  assert.equal(hueSatToInt(12345, 0), 0xffffff);
  assert.equal(hueSatToInt(undefined, 10), undefined);
  assert.deepEqual(intToHueSat(0x00ff00), { hue: 21845, sat: 255 });
  assert.deepEqual(intToHueSat(0x800000), { hue: 0, sat: 255 }, 'a dark red is red');
  assert.deepEqual(intToHueSat(0x000000), { hue: 0, sat: 0 });
});
