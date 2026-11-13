// Presentational form primitives shared by the composition tab and the WallKit
// control tabs. No state and no config knowledge: every value comes in through
// props, every edit goes straight back out.
//
// Keep these dumb — the drawer is the only consumer, and the "copy config" exit
// relies on values passing through untouched when the user does not edit them.

import { ANCHORS } from 'wallkit/core'

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
export function SelectField({ label, value, options, onChange }) {
  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{label}</span>
      </div>
      <div className="ws-field-controls">
        <select className="ws-select" value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

const HEX = /^#[0-9a-f]{6}$/i

// `#rrggbb` field with a native swatch. An empty value means "inherit": the
// swatch then previews `fallback` and the text shows it as a placeholder.
export function ColorField({ label, value, fallback, onChange }) {
  const swatch = HEX.test(value || '') ? value : HEX.test(fallback || '') ? fallback : '#a8c4ff'
  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{label}</span>
        {value ? (
          <button type="button" className="ws-reset" onClick={() => onChange('')}>
            跟随主题色
          </button>
        ) : (
          <span className="ws-field-readout">跟随主题色</span>
        )}
      </div>
      <div className="ws-field-controls">
        <input
          className="ws-swatch"
          type="color"
          value={swatch}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
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
