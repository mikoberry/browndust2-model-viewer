// WE user properties: parsing, clamping, and React access.
//
// The raw values land in window.__bd2UserProps via the classic script in
// index.html (WE calls applyUserProperties before ES modules run). This module
// normalizes them with defaults so the wallpaper runs identically in a plain
// browser (dev) without the WE host.

import { useEffect, useState } from 'react'

export const DEFAULT_PROPERTIES = {
  clockStyle: 'ring',
  spectrumStyle: 'curve',
  parallax: 60, // 0..100
  autoPerform: 90, // seconds, 0 = off
  dim: 94, // percent brightness 50..100
  ambientPose: false,
}

const CLOCK_STYLES = ['ring', 'card', 'minimal', 'none']
const SPECTRUM_STYLES = ['curve', 'bars', 'none']

function clamp(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PROPERTIES }
  return {
    clockStyle: CLOCK_STYLES.includes(raw.clockstyle)
      ? raw.clockstyle
      : DEFAULT_PROPERTIES.clockStyle,
    spectrumStyle: SPECTRUM_STYLES.includes(raw.spectrumstyle)
      ? raw.spectrumstyle
      : DEFAULT_PROPERTIES.spectrumStyle,
    parallax: clamp(raw.parallax, 0, 100, DEFAULT_PROPERTIES.parallax),
    autoPerform: clamp(raw.autoperform, 0, 300, DEFAULT_PROPERTIES.autoperform ?? DEFAULT_PROPERTIES.autoPerform),
    dim: clamp(raw.dim, 50, 100, DEFAULT_PROPERTIES.dim),
    ambientPose: raw.ambientpose === true || raw.ambientpose === 'true',
  }
}

export function useUserProperties() {
  const [props, setProps] = useState(() =>
    normalize(typeof window !== 'undefined' ? window.__bd2UserProps : undefined),
  )

  useEffect(() => {
    const onChange = (event) => setProps(normalize(event.detail))
    window.addEventListener('bd2-props', onChange)
    return () => window.removeEventListener('bd2-props', onChange)
  }, [])

  return props
}
