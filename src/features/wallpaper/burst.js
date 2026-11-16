// One-shot burst effect (wallkit `BurstFx`) for the wallpaper route.
//
// This is a BUILD-TIME setting, not a viewer setting: it is hand-edited in
// `wallpaper.config.json` under `overlay.burst`, per wallpaper, before a build.
// The drawer deliberately has no tab for it, and a recorded snapshot never
// carries the key (see `configPayload` in WallpaperSettings) — the shipped file
// stays the only source.
//
// Presence is the switch: with no `overlay.burst` the chrome button is not
// rendered at all, so a wallpaper that nobody armed looks exactly like before.
//
// Units follow the host side of the boundary, not wallkit's raw contract:
//   x / y   viewport fractions, 0..1, (0,0) = top-left.
//   angle   DEGREES, 0 = straight up, NEGATIVE = counter-clockwise. The default
//           -135 therefore fires up-and-left (second quadrant; wallkit's own
//           default is -3π/4 for the same reason), which `burstCommand()`
//           converts to the radians `BurstFx.burst()` expects.
//           Note the sign: wallkit's projectile uses (cos, sin) with screen y
//           pointing down, so -45 is up-and-RIGHT and -135 is up-and-LEFT.
//   size / intensity / speed   percentages (wallkit's own 20..300 / 0..300 /
//           20..300 fences are applied here, so a typo cannot blank the layer).
//   count   particles per fire, 0 = keep the kind's preset.
//   color   `#rgb` / `#rrggbb`; empty = keep the kind's own palette (confetti
//           rainbow, spray water blue, yogurt cream).

export const BURST_KINDS = ['confetti', 'spray', 'yogurt']

// Right-middle of the screen, nudged 3% inward, fired up-and-left at 45°: the
// "party popper in the corner of the picture" pose. `x: 0.97` is that 3% inset
// (1 = the right edge), kept as a fraction because BurstFx works in viewport
// fractions and the value is resolution independent.
export const BURST_DEFAULTS = {
  kind: 'spray',
  x: 0.97,
  y: 0.5,
  angle: -135,
  size: 100,
  intensity: 100,
  speed: 100,
  count: 0,
  color: '',
}

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function clamped(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

function hexColor(value) {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
    ? value.trim()
    : ''
}

/**
 * Normalize a raw `overlay.burst` value.
 *
 * @param {unknown} raw  The raw config value: absent → null (no button),
 *   `true` → all defaults, an object → defaults with its own fields.
 * @returns {null | typeof BURST_DEFAULTS} A complete spec, or null when the
 *   wallpaper was not armed for this effect.
 */
export function normalizeBurstConfig(raw) {
  if (raw === true) return { ...BURST_DEFAULTS }
  if (!isPlainObject(raw)) return null

  return {
    kind: BURST_KINDS.includes(raw.kind) ? raw.kind : BURST_DEFAULTS.kind,
    x: clamped(raw.x, BURST_DEFAULTS.x, 0, 1),
    y: clamped(raw.y, BURST_DEFAULTS.y, 0, 1),
    angle: clamped(raw.angle, BURST_DEFAULTS.angle, -180, 180),
    size: clamped(raw.size, BURST_DEFAULTS.size, 20, 300),
    intensity: clamped(raw.intensity, BURST_DEFAULTS.intensity, 0, 300),
    speed: clamped(raw.speed, BURST_DEFAULTS.speed, 20, 300),
    count: Math.round(clamped(raw.count, BURST_DEFAULTS.count, 0, 400)),
    color: hexColor(raw.color),
  }
}

/**
 * Turn a normalized spec into the `burst(kind, opts)` arguments.
 *
 * @param {typeof BURST_DEFAULTS} spec
 * @returns {{ opts: object, kind: string }}
 */
export function burstCommand(spec) {
  const opts = {
    x: spec.x,
    y: spec.y,
    angle: (spec.angle * Math.PI) / 180,
    size: spec.size,
    intensity: spec.intensity,
    speed: spec.speed,
  }
  // 0 means "the kind's own particle count": omitting the field is how wallkit
  // expresses that (it falls back to the preset per fire).
  if (spec.count > 0) opts.count = spec.count
  return { kind: spec.kind, opts }
}
