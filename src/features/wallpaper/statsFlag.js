// The performance HUD switch, shared by the drawer toggle and the readout.
//
// Persisted in localStorage so it survives Wallpaper Engine reloads, and
// announced with a DOM event so flipping it in the drawer takes effect without
// a reload. The URL forms (`?stats=1`, `#stats`) stay as an escape hatch for the
// cases where the drawer cannot be reached; an explicit stored value — including
// a stored "off" — wins over them, so the toggle can always turn the readout
// back off.
//
// Storage can be denied on some Wallpaper Engine origins, so the last value also
// lives in memory: the switch keeps working for the session, it just will not be
// remembered across reloads.

const KEY = 'bd2.stats'
const CHANGE_EVENT = 'bd2:stats-change'

let memoryValue = null

function fromUrl() {
  try {
    if (new URLSearchParams(window.location.search).get('stats') === '1') return true
    if (window.location.hash.includes('stats')) return true
  } catch {
    // No location (unlikely) — treat as off.
  }
  return null
}

export function readStatsFlag() {
  if (memoryValue !== null) return memoryValue
  let stored = null
  try {
    stored = window.localStorage.getItem(KEY)
  } catch {
    stored = null
  }
  if (stored === '1') return true
  if (stored === '0') return false
  return fromUrl() === true
}

export function writeStatsFlag(on) {
  const next = Boolean(on)
  memoryValue = next
  try {
    window.localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    // Memory-only; the event below still updates the readout.
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // No DOM (tests) — callers re-read on their own tick.
  }
}

export function subscribeStatsFlag(listener) {
  const handler = () => listener(readStatsFlag())
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}
