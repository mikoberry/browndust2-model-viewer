// Resolution-independent chrome sizing.
//
// Every length in the wallpaper chrome is authored against a 1920x1080 screen and
// written as `calc(<n>px * var(--ui-scale))`. This module owns that variable, so a
// 2560x1440 monitor gets the same apparent size as a 1080p one instead of text that
// looks 2/3 of the size. 1px hairlines are deliberately left unwrapped.

export const UI_REFERENCE = { width: 1920, height: 1080 }

// Below ~1366x768 the chrome would get unusably small; above 4K (or an unusual
// ultrawide) there is no point in growing further.
export const UI_SCALE_RANGE = { min: 0.85, max: 2.4 }

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// `min(w/1920, h/1080)` rather than an area average: an ultrawide shares the height
// of a 16:9 panel, so its widgets should be the same physical size, not bigger.
export function resolveUiScale(
  { width, height } = {},
  { min = UI_SCALE_RANGE.min, max = UI_SCALE_RANGE.max } = {},
) {
  const w = Number.isFinite(width) && width > 0 ? width : UI_REFERENCE.width
  const h = Number.isFinite(height) && height > 0 ? height : UI_REFERENCE.height
  const raw = Math.min(w / UI_REFERENCE.width, h / UI_REFERENCE.height)
  // 3 decimals keeps the custom property short without a visible jump.
  return Math.round(clamp(raw, min, max) * 1000) / 1000
}

const CSS_VAR = '--ui-scale'

// Writes the scale onto <html> as an inline custom property (inline wins over the
// `1` fallback in the stylesheet). Returns a cleanup function.
//
// The resize handler is rAF-throttled: Wallpaper Engine can emit a burst of resize
// events while a wallpaper is being set, and restyling a scrollable drawer per
// event would be wasteful.
export function installUiScale(doc = globalThis.document, win = globalThis.window) {
  if (!doc || !win) return () => {}
  const root = doc.documentElement
  if (!root) return () => {}

  let frame = 0

  const apply = () => {
    frame = 0
    root.style.setProperty(CSS_VAR, String(resolveUiScale({ width: win.innerWidth, height: win.innerHeight })))
  }

  const schedule = () => {
    if (frame) return
    frame = win.requestAnimationFrame(apply)
  }

  apply()
  win.addEventListener('resize', schedule, { passive: true })

  return () => {
    win.removeEventListener('resize', schedule)
    if (frame) win.cancelAnimationFrame(frame)
  }
}
