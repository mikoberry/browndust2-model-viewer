// Presentational form primitives shared by the composition tab and the WallKit
// control tabs. No state and no config knowledge: every value comes in through
// props, every edit goes straight back out.
//
// Keep these dumb — the drawer is the only consumer, and the "copy config" exit
// relies on values passing through untouched when the user does not edit them.

import { useEffect, useRef, useState } from 'react'
import { ANCHORS } from 'wallkit/core'
import { HEX, hexToHsv, hsvToHex } from '../color.js'

const clamp01 = (value) => Math.min(1, Math.max(0, value))

const round2 = (value) => Math.round(value * 100) / 100

const ANCHOR_LABELS = {
  'top-left': '左上',
  'top-center': '上中',
  'top-right': '右上',
  'center-left': '左中',
  center: '居中',
  'center-right': '右中',
  'bottom-left': '左下',
  'bottom-center': '下中',
  'bottom-right': '右下',
}

export function Group({ title, note, onReset, children }) {
  return (
    <section className="ws-group">
      {(title || onReset) && (
        <div className="ws-group-head">
          <h3>{title ?? ''}</h3>
          {onReset && (
            <button type="button" className="ws-reset" onClick={onReset}>
              重置
            </button>
          )}
        </div>
      )}
      {children}
      {note && <p className="ws-note">{note}</p>}
    </section>
  )
}

// Slider + number box, kept in sync. `readout` is optional: without it the raw
// value is shown with `suffix`.
export function SliderField({ label, readout, min, max, step, value, onChange, suffix = '' }) {
  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{label}</span>
        <span className="ws-field-readout">{readout ?? `${value}${suffix}`}</span>
      </div>
      <div className="ws-field-controls">
        <input
          className="ws-range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <input
          className="ws-number"
          type="number"
          min={min}
          max={max}
          step={step}
          value={round2(value)}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
        />
      </div>
    </div>
  )
}

// Free-form number without a slider (offsets can be negative and range widely).
export function NumberField({ label, value, step = 1, onChange, suffix = '' }) {
  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{label}</span>
      </div>
      <div className="ws-field-controls">
        <input
          className="ws-number is-wide"
          type="number"
          step={step}
          value={round2(value)}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
        />
        <span className="ws-field-readout">{suffix}</span>
      </div>
    </div>
  )
}

export function TextField({ label, value, placeholder, onChange }) {
  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{label}</span>
      </div>
      <div className="ws-field-controls">
        <input
          className="ws-text"
          type="text"
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
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
// a popup — buttons, checkboxes and text fields only.
export function ChipField({ label, value, options, onChange }) {
  const known = options.some((option) => option.value === value)
  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{label}</span>
        {!known && <span className="ws-field-readout">{value}（不在预设内）</span>}
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
              {option.label}
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
        aria-label="饱和度与亮度（拖动选择）"
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
      <div ref={hueRef} className="ws-picker-hue" role="group" aria-label="色相（拖动选择）" {...drag(readHue)}>
        <span className="ws-picker-hue-mark" style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
    </div>
  )
}

// `#rrggbb` field. An empty value means "inherit": the swatch then previews
// `fallback` and the text shows it as a placeholder.
export function ColorField({ label, value, fallback, onChange, allowInherit = true }) {
  const [open, setOpen] = useState(false)
  const resolved = HEX.test(value || '') ? value : HEX.test(fallback || '') ? fallback : '#a8c4ff'
  // HSV is kept locally so dragging through black / grey does not lose the hue
  // (at v = 0 every hue maps to #000000 and back).
  const [hsv, setHsv] = useState(() => hexToHsv(resolved))

  useEffect(() => {
    const next = hexToHsv(resolved)
    setHsv((prev) => (hsvToHex(prev) === hsvToHex(next) ? prev : next))
  }, [resolved])

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
              跟随主题色
            </button>
          ) : (
            <span className="ws-field-readout">跟随主题色</span>
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
          aria-label={`${label}取色面板`}
          aria-expanded={open}
          title="展开取色面板"
          onClick={() => setOpen((next) => !next)}
        />
        <input
          className="ws-text"
          type="text"
          value={value}
          placeholder={fallback || '#a8c4ff'}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value.trim())}
        />
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
        <span className="ws-field-label">位置</span>
        <span className="ws-field-readout">{ANCHOR_LABELS[value] ?? value}</span>
      </div>
      <div className="ws-anchor-grid" role="group" aria-label="位置锚点">
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
