// Presentational form primitives shared by the composition tab and the WallKit
// control tabs. No state and no config knowledge: every value comes in through
// props, every edit goes straight back out.
//
// Keep these dumb — the drawer is the only consumer, and the "copy config" exit
// relies on values passing through untouched when the user does not edit them.

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ANCHORS } from 'wallkit/core'
import { HEX, hexToHsv, hsvToHex } from '../color.js'
import { t } from '../../../lib/i18n.js'

// The drawer is never unmounted (it slides out with a transform), so any local
// "expanded" state — the colour pickers below — would still be open the next
// time it slides back in. The drawer publishes its open flag here and the
// pickers collapse whenever it turns false, which keeps a reopened drawer at
// its default, fully collapsed state.
export const DrawerOpenContext = createContext(true)

const clamp01 = (value) => Math.min(1, Math.max(0, value))

const round2 = (value) => Math.round(value * 100) / 100

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// One press of `+` / `-` moves by exactly one `step`, snapped to the step grid so
// repeated presses cannot drift into 0.30000000000000004.
const nudge = (value, step, direction) => round2(round2(value / step) * step + direction * step)

const ANCHOR_KEYS = {
  'top-left': 'anchor.topLeft',
  'top-center': 'anchor.topCenter',
  'top-right': 'anchor.topRight',
  'center-left': 'anchor.centerLeft',
  center: 'anchor.center',
  'center-right': 'anchor.centerRight',
  'bottom-left': 'anchor.bottomLeft',
  'bottom-center': 'anchor.bottomCenter',
  'bottom-right': 'anchor.bottomRight',
}

const ANCHOR_LABELS = Object.fromEntries(
  Object.entries(ANCHOR_KEYS).map(([key, msgKey]) => [key, t(msgKey)]),
)

export function Group({ title, note, onReset, children }) {
  return (
    <section className="ws-group">
      {(title || onReset) && (
        <div className="ws-group-head">
          <h3>{title ?? ''}</h3>
          {onReset && (
            <button type="button" className="ws-reset" onClick={onReset}>
              {t('common.reset')}
            </button>
          )}
        </div>
      )}
      {children}
      {note && <p className="ws-note">{note}</p>}
    </section>
  )
}

// Slider flanked by two stepper buttons. `readout` is optional: without it the
// raw value is shown with `suffix`.
//
// There is no number input on purpose: Wallpaper Engine never gives the wallpaper
// window a real keyboard focus, so typing into a field is impossible there. Every
// value that needs a precise nudge gets a `-` / `+` button instead.
export function SliderField({ label, readout, min, max, step, value, onChange, suffix = '' }) {
  const bump = (direction) => {
    const next = clamp(nudge(value, step, direction), min, max)
    if (next !== value) onChange(next)
  }

  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{label}</span>
        <span className="ws-field-value">{readout ?? `${value}${suffix}`}</span>
      </div>
      <div className="ws-field-controls">
        <button
          type="button"
          className="ws-step"
          aria-label={`${label}减少`}
          title={`-${step}${suffix}`}
          onClick={() => bump(-1)}
        >
          -
        </button>
        <input
          className="ws-range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <button
          type="button"
          className="ws-step"
          aria-label={`${label}增加`}
          title={`+${step}${suffix}`}
          onClick={() => bump(1)}
        >
          +
        </button>
      </div>
    </div>
  )
}

// A CSS length (`100vw`, `14vh`, `640px`) driven by the same +/- steppers. The
// unit is read off the current value and written back untouched, so a config that
// says `100vw` never turns into `100px`; an empty value means "let the widget
// decide" and is restored by the 自动 button.
const LENGTH = /^(-?\d+(?:\.\d+)?)([a-z%]*)$/i

export function LengthField({ label, value, step = 2, onChange }) {
  const text = String(value ?? '').trim()
  const parsed = LENGTH.exec(text)
  const bump = (direction) => {
    if (!parsed) return
    const next = clamp(nudge(Number(parsed[1]), step, direction), 0, 10000)
    onChange(`${next}${parsed[2]}`)
  }

  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{label}</span>
        {text ? (
          <button type="button" className="ws-reset" onClick={() => onChange('')}>
            {t('common.auto')}
          </button>
        ) : (
          <span className="ws-field-readout">{t('common.decidedBySize')}</span>
        )}
      </div>
      <div className="ws-field-controls">
        <button
          type="button"
          className="ws-step"
          aria-label={`${label}减少`}
          title={`-${step}`}
          disabled={!parsed}
          onClick={() => bump(-1)}
        >
          -
        </button>
        <span className="ws-step-value" title={text || t('common.decidedBySize')}>
          {text || t('common.auto')}
        </span>
        <button
          type="button"
          className="ws-step"
          aria-label={`${label}增加`}
          title={`+${step}`}
          disabled={!parsed}
          onClick={() => bump(1)}
        >
          +
        </button>
      </div>
    </div>
  )
}

export function ToggleField({ label, note, checked, onChange }) {
  return (
    <label className="ws-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="ws-toggle-text">
        {label}
        {note && <em>{note}</em>}
      </span>
    </label>
  )
}

// `options` is `[{ value, label }]`; the value is written back verbatim, so an
// unknown option in the config file would show as-is rather than be rewritten.
//
// Plain buttons, NOT a native <select>: Wallpaper Engine renders the wallpaper
// in a CEF host where the dropdown list is an OS-level popup, and opening one
// takes the whole wallpaper window down. Nothing inside the drawer may rely on
// a popup — buttons and checkboxes only.
export function ChipField({ label, value, options, onChange }) {
  const known = options.some((option) => option.value === value)
  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{label}</span>
        {!known && <span className="ws-field-readout">{value}（{t('common.notInPreset')}）</span>}
      </div>
      <div className="ws-chips" role="group" aria-label={label}>
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              className={`ws-chip${active ? ' is-active' : ''}`}
              aria-pressed={active}
              title={option.value}
              onClick={() => onChange(option.value)}
            >
              {typeof option.label === 'function' ? option.label() : option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Inline colour picker: saturation / value square plus a hue strip, all drawn
// with CSS gradients and pointer events.
//
// Deliberately hand-rolled. `input type="color"` would be one line, but it opens
// the OS colour dialog, which takes the Wallpaper Engine window down — the same
// popup trap as `<select>`. This panel lives inside the drawer, so nothing is
// ever layered outside the page.
function ColorPickerPanel({ hsv, onChange }) {
  const areaRef = useRef(null)
  const hueRef = useRef(null)
  const hue = hsvToHex({ h: hsv.h, s: 1, v: 1 })

  // Pointer capture keeps the drag alive when the cursor leaves the handle or
  // the drawer scrolls under it.
  const drag = (read) => ({
    onPointerDown: (event) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      onChange(read(event))
    },
    onPointerMove: (event) => {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) onChange(read(event))
    },
    onPointerUp: (event) => event.currentTarget.releasePointerCapture?.(event.pointerId),
    onPointerCancel: (event) => event.currentTarget.releasePointerCapture?.(event.pointerId),
  })

  const readArea = (event) => {
    const rect = areaRef.current?.getBoundingClientRect()
    if (!rect?.width || !rect?.height) return hsv
    return {
      ...hsv,
      s: clamp01((event.clientX - rect.left) / rect.width),
      v: 1 - clamp01((event.clientY - rect.top) / rect.height),
    }
  }

  const readHue = (event) => {
    const rect = hueRef.current?.getBoundingClientRect()
    if (!rect?.width) return hsv
    return { ...hsv, h: clamp01((event.clientX - rect.left) / rect.width) * 360 }
  }

  return (
    <div className="ws-picker">
      <div
        ref={areaRef}
        className="ws-picker-area"
        style={{ backgroundColor: hue }}
        role="group"
        aria-label={t('picker.satBright')}
        {...drag(readArea)}
      >
        <span
          className="ws-picker-dot"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: hsvToHex(hsv),
          }}
        />
      </div>
      <div ref={hueRef} className="ws-picker-hue" role="group" aria-label={t('picker.hue')} {...drag(readHue)}>
        <span className="ws-picker-hue-mark" style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
    </div>
  )
}

// `#rrggbb` field. An empty value means "inherit": the swatch and the hex readout
// then preview `fallback`. The hex itself is a readout, not an input — WE has no
// keyboard, so the value can only be changed through the picker (or the config
// file).
export function ColorField({ label, value, fallback, onChange, allowInherit = true }) {
  const drawerOpen = useContext(DrawerOpenContext)
  const [open, setOpen] = useState(false)
  const resolved = HEX.test(value || '') ? value : HEX.test(fallback || '') ? fallback : '#a8c4ff'
  // HSV is kept locally so dragging through black / grey does not lose the hue
  // (at v = 0 every hue maps to #000000 and back).
  const [hsv, setHsv] = useState(() => hexToHsv(resolved))

  useEffect(() => {
    const next = hexToHsv(resolved)
    setHsv((prev) => (hsvToHex(prev) === hsvToHex(next) ? prev : next))
  }, [resolved])

  // Closing the drawer folds every expanded picker back up, so reopening it
  // never shows a panel the user left behind.
  useEffect(() => {
    if (!drawerOpen) setOpen(false)
  }, [drawerOpen])

  const commit = (next) => {
    setHsv(next)
    onChange(hsvToHex(next))
  }

  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{label}</span>
        {allowInherit ? (
          value ? (
            <button type="button" className="ws-reset" onClick={() => onChange('')}>
              {t('common.followAccent')}
            </button>
          ) : (
            <span className="ws-field-readout">{t('common.followAccent')}</span>
          )
        ) : (
          <span className="ws-field-readout">{hsvToHex(hsv)}</span>
        )}
      </div>
      <div className="ws-field-controls">
        <button
          type="button"
          className={`ws-swatch-preview${open ? ' is-open' : ''}`}
          style={{ background: resolved }}
          aria-label={`${label}${t('picker.expand')}`}
          aria-expanded={open}
          title={t('picker.expand')}
          onClick={() => setOpen((next) => !next)}
        />
        <span className="ws-hex" title={t('picker.hexHint')}>
          {value || resolved}
        </span>
      </div>
      {open && <ColorPickerPanel hsv={hsv} onChange={commit} />}
    </div>
  )
}

// 3x3 anchor picker. `ANCHORS` is exported by wallkit/core in reading order, so
// the grid needs no hard-coded copy.
export function AnchorPicker({ value, onChange }) {
  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{t('widget.anchor')}</span>
        <span className="ws-field-readout">{ANCHOR_LABELS[value] ?? value}</span>
      </div>
      <div className="ws-anchor-grid" role="group" aria-label={t('anchor.grid')}>
        {ANCHORS.map((anchor) => (
          <button
            key={anchor}
            type="button"
            className={`ws-anchor-cell${value === anchor ? ' is-active' : ''}`}
            title={ANCHOR_LABELS[anchor]}
            aria-label={ANCHOR_LABELS[anchor]}
            aria-pressed={value === anchor}
            onClick={() => onChange(anchor)}
          />
        ))}
      </div>
    </div>
  )
}
