// Colour conversion for the settings drawer's picker.
//
// Kept free of React and DOM so it can be exercised from plain Node (see
// AGENTS §13): the picker's whole correctness lives in these two functions.

export const HEX = /^#[0-9a-f]{6}$/i

const clamp01 = (value) => Math.min(1, Math.max(0, value))

/**
 * @param {string} hex `#rrggbb`
 * @returns {{h: number, s: number, v: number}} h in degrees, s / v in 0..1.
 */
export function hexToHsv(hex) {
  const match = HEX.exec(hex)
  if (!match) return { h: 0, s: 0, v: 1 }
  const int = Number.parseInt(match[0].slice(1), 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * ((b - r) / delta + 2)
    else h = 60 * ((r - g) / delta + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

/**
 * @param {{h: number, s: number, v: number}} hsv
 * @returns {string} `#rrggbb` (lowercase).
 */
export function hsvToHex({ h, s, v }) {
  const hue = ((h % 360) + 360) % 360
  const c = clamp01(v) * clamp01(s)
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = clamp01(v) - c
  const sector = Math.floor(hue / 60) % 6
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector]
  return `#${rgb
    .map((channel) =>
      Math.round(clamp01(channel + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}
