// -----------------------------------------------------------------------------
// Light colors: deCONZ speaks CIE xy and hue/saturation, Gladys an RGB integer
// (0xRRGGBB). The xy conversion uses the same Wide-gamut matrix and sRGB gamma
// as the Gladys core (server/utils/colors.js), so a deCONZ light shows the
// color a Zigbee2MQTT one would. Pure functions.
// -----------------------------------------------------------------------------

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const gamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const linear = (v) => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92);

export const rgbToInt = ([r, g, b]) => (r << 16) | (g << 8) | b;
export const intToRgb = (n) => [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

/** CIE xy (full brightness) -> RGB integer. */
export function xyToInt(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || y <= 0) {
    return undefined;
  }
  const X = x / y;
  const Z = (1 - x - y) / y;
  const rgb = [
    1.656492 * X - 0.354851 - 0.255038 * Z,
    -0.707196 * X + 1.655397 + 0.036152 * Z,
    0.051713 * X - 0.121364 + 1.01153 * Z,
  ].map((v) => gamma(Math.max(0, v)));
  const max = Math.max(...rgb);
  const scaled = max > 1 ? rgb.map((v) => v / max) : rgb;
  return rgbToInt(scaled.map((v) => clamp(Math.round(v * 255), 0, 255)));
}

/** RGB integer -> CIE xy, rounded to 4 decimals (deCONZ precision). */
export function intToXy(n) {
  const [r, g, b] = intToRgb(n).map((v) => linear(v / 255));
  const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  const Z = r * 0.000088 + g * 0.07231 + b * 0.986039;
  const sum = X + Y + Z;
  if (sum === 0) {
    // Black has no chromaticity: the white point of the gamut.
    return [0.3227, 0.329];
  }
  return [X / sum, Y / sum].map((v) => Math.round(v * 10_000) / 10_000);
}

/**
 * deCONZ hue (0-65535) and saturation (0-255) -> RGB integer, at full
 * brightness (brightness is a feature of its own).
 */
export function hueSatToInt(hue, sat) {
  if (!Number.isFinite(hue) || !Number.isFinite(sat)) {
    return undefined;
  }
  const h = ((hue / 65535) * 360) % 360;
  const s = clamp(sat / 255, 0, 1);
  const f = (k0) => {
    const k = (k0 + h / 60) % 6;
    return 1 - s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToInt([f(5), f(3), f(1)].map((v) => Math.round(v * 255)));
}

/** RGB integer -> deCONZ { hue, sat } (the brightness of the RGB is dropped). */
export function intToHueSat(n) {
  const [r, g, b] = intToRgb(n).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  let h = 0;
  if (chroma > 0) {
    if (max === r) {
      h = ((g - b) / chroma) % 6;
    } else if (max === g) {
      h = (b - r) / chroma + 2;
    } else {
      h = (r - g) / chroma + 4;
    }
  }
  const degrees = (h * 60 + 360) % 360;
  return {
    hue: Math.round((degrees / 360) * 65535),
    sat: max === 0 ? 0 : Math.round((chroma / max) * 255),
  };
}
