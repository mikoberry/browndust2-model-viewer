// Settings drawer for the wallpaper route. It only nudges the two composition
// layers (scale + offset) LIVE, and deliberately exposes them in design-canvas
// units so anything tuned here can be pasted into config.js verbatim and stays
// resolution independent. Purely presentational: the parent owns the state.
//
// The wallpaper itself must stay a chrome-free image, so this drawer is closed
// by default and opened by the bottom-right button or the `S` key.

import { useEffect, useRef, useState } from 'react'
import { CONFIG_FILE, CONFIG_README } from '../config.js'

const SCALE_MIN = 0.25
const SCALE_MAX = 3
const SCALE_STEP = 0.01

const round2 = (value) => Math.round(value * 100) / 100

const formatScale = (value) => `${Number(value).toFixed(2)}×`

// Offsets are shown as raw design pixels plus the equivalent percentage, so the
// number maps 1:1 onto the config value the user will copy.
function formatOffset(value, basis) {
  const percent = basis > 0 ? (value / basis) * 100 : 0
  return `${Math.round(value)} px · ${percent.toFixed(1)}%`
}

function SliderField({ label, readout, min, max, step, value, onChange }) {
  return (
    <div className="ws-field">
      <div className="ws-field-head">
        <span className="ws-field-label">{label}</span>
        <span className="ws-field-readout">{readout}</span>
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

function LayerGroup({ title, note, spec, design, onChange, onReset }) {
  // A full canvas each way: on a 21:9 screen the backdrop has to travel well
  // past half its own width to reach the letterbox, so half a canvas is not
  // enough. The canvas is no longer clipped, so these offsets really do move
  // the layer across the whole screen (the viewport clips it, not the canvas).
  const limitX = Math.max(1, Math.round(design.width))
  const limitY = Math.max(1, Math.round(design.height))

  return (
    <section className="ws-group">
      <div className="ws-group-head">
        <h3>{title}</h3>
        <button type="button" className="ws-reset" onClick={onReset}>
          重置
        </button>
      </div>
      <SliderField
        label="缩放"
        readout={formatScale(spec.scale)}
        min={SCALE_MIN}
        max={SCALE_MAX}
        step={SCALE_STEP}
        value={spec.scale}
        onChange={(scale) => onChange({ scale: Math.max(scale, SCALE_MIN) })}
      />
      <SliderField
        label="水平偏移"
        readout={formatOffset(spec.offsetX, design.width)}
        min={-limitX}
        max={limitX}
        step={1}
        value={spec.offsetX}
        onChange={(offsetX) => onChange({ offsetX })}
      />
      <SliderField
        label="垂直偏移"
        readout={formatOffset(spec.offsetY, design.height)}
        min={-limitY}
        max={limitY}
        step={1}
        value={spec.offsetY}
        onChange={(offsetY) => onChange({ offsetY })}
      />
      {note && <p className="ws-note">{note}</p>}
    </section>
  )
}

// Full config document, ready to replace wallpaper.config.json: every key of
// the live config, with the two layer transforms overwritten by what the drawer
// is showing right now. Key order follows the built-in object, so the clipboard
// content is diff-stable against the shipped file.
function configJson(config, spec) {
  const layer = (item) => ({
    scale: round2(item.scale),
    offsetX: Math.round(item.offsetX),
    offsetY: Math.round(item.offsetY),
  })
  const payload = {
    _readme: CONFIG_README,
    ...config,
    backdropTransform: layer(spec.backdrop),
    modelTransform: layer(spec.model),
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

export default function WallpaperSettings({ open, design, config, spec, source, onChange, onReset, onClose }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(0)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  // Copying is the whole point of the drawer: tune by eye, replace the file.
  const handleCopy = async () => {
    const text = configJson(config, spec)
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      document.body.removeChild(area)
    }
    setCopied(ok)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <aside className={`wallpaper-settings${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="ws-head">
        <div>
          <h2>构图设置</h2>
          <p>
            设计画布 {Math.round(design.width)} × {Math.round(design.height)}
          </p>
          <p className={`ws-source${source === 'file' ? '' : ' is-fallback'}`}>
            {source === 'file' ? `默认值：${CONFIG_FILE}` : '默认值：内置（未读到配置文件）'}
          </p>
        </div>
        <button type="button" className="ws-close" onClick={onClose} aria-label="关闭设置">
          ×
        </button>
      </div>

      <div className="ws-body">
        <LayerGroup
          title="背景"
          spec={spec.backdrop}
          design={design}
          onChange={(patch) => onChange('backdrop', patch)}
          onReset={() => onReset('backdrop')}
        />
        <LayerGroup
          title="模型"
          spec={spec.model}
          design={design}
          onChange={(patch) => onChange('model', patch)}
          onReset={() => onReset('model')}
        />
        <p className="ws-note">
          偏移单位为设计画布像素（与 {CONFIG_FILE} 一致），平移不会被缩放放大。
          1× 时背景正好等于画布，拖出去的部分会露出模糊补边；想铺满整屏就先放大再拖。
          「复制配置」得到完整的配置文件内容，可直接替换 {CONFIG_FILE} 后刷新。
        </p>
      </div>

      <div className="ws-foot">
        <button type="button" className="ws-btn" onClick={() => onReset('all')}>
          全部重置
        </button>
        <button type="button" className="ws-btn is-primary" onClick={handleCopy}>
          {copied ? '已复制配置' : '复制配置'}
        </button>
      </div>
    </aside>
  )
}
