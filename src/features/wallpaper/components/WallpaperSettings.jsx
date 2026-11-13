// Settings drawer for the wallpaper route. Two kinds of editing, both live and
// both purely in-memory:
//
//   1. the composition tab nudges the two picture layers (scale + offset) in
//      design-canvas units, so anything tuned here can be pasted into the
//      config verbatim and stays resolution independent;
//   2. one tab per WallKit control overlay (clock / spectrum / album card /
//      particles / pointer effects) edits that widget's size, position, colour
//      and its own options.
//
// The wallpaper itself must stay a chrome-free image, so this drawer is closed
// by default and opened by the bottom-right button or the `S` key. Edits never
// write back to config.js. The exit is "记录配置": it snapshots the COMPLETE
// config file (byte-identical to public/wallpaper.config.json when nothing was
// touched) into localStorage and puts the same text on the clipboard, so a
// tuned setup survives the wallpaper being reloaded or the host restarting.
// The snapshot is never read back automatically — the file stays the single
// source of truth.

import { useEffect, useRef, useState } from 'react'
import { CONFIG_FILE, CONFIG_README } from '../config.js'
import OverlaySettings, { OVERLAY_TABS } from './OverlaySettings.jsx'
import { ColorField, Group, SliderField, ToggleField } from './settings-fields.jsx'

const SCALE_MIN = 0.25
const SCALE_MAX = 3
const SCALE_STEP = 0.01

// Parallax strength is a percentage of the design canvas; ±20% is already a
// huge drift on a 2048px artwork, so the slider stops there.
const PARALLAX_MIN = -20
const PARALLAX_MAX = 20
const PARALLAX_STEP = 0.5

const round2 = (value) => Math.round(value * 100) / 100

const formatScale = (value) => `${Number(value).toFixed(2)}×`

const formatPercent = (value) => `${round2(value ?? 0)}%`

// Offsets are shown as raw design pixels plus the equivalent percentage, so the
// number maps 1:1 onto the config value the user will copy.
function formatOffset(value, basis) {
  const percent = basis > 0 ? (value / basis) * 100 : 0
  return `${Math.round(value)} px · ${percent.toFixed(1)}%`
}

function LayerGroup({ title, note, spec, design, onChange, onReset }) {
  // A full canvas each way: on a 21:9 screen the backdrop has to travel well
  // past half its own width to reach the letterbox, so half a canvas is not
  // enough. The canvas is no longer clipped, so these offsets really do move
  // the layer across the whole screen (the viewport clips it, not the canvas).
  const limitX = Math.max(1, Math.round(design.width))
  const limitY = Math.max(1, Math.round(design.height))

  return (
    <Group title={title} note={note} onReset={onReset}>
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
    </Group>
  )
}

// Mouse parallax: one master switch plus one strength per layer, so the
// character can drift while the background stays put (or vice versa). Strength
// is a percentage of the design canvas — positive follows the pointer, negative
// goes the other way, 0 keeps that layer still. Nothing here is screen-relative,
// so the drift is identical on every resolution.
function ParallaxGroup({ spec, onChange, onReset }) {
  return (
    <Group
      title="鼠标视差"
      onReset={onReset}
      note="强度按设计画布百分比：正值随鼠标同向、负值反向、0 不动；指针移出画面会自动回中。"
    >
      <ToggleField
        label="启用视差"
        checked={spec.enabled !== false}
        onChange={(enabled) => onChange({ enabled })}
      />
      {/* Two strengths share one row: the drawer has to fit the window height
          (no wheel in Wallpaper Engine), and each slider is short enough. */}
      <div className="ws-pair">
        <SliderField
          label="背景强度"
          readout={formatPercent(spec.backdrop)}
          min={PARALLAX_MIN}
          max={PARALLAX_MAX}
          step={PARALLAX_STEP}
          value={Number.isFinite(spec.backdrop) ? spec.backdrop : 0}
          onChange={(backdrop) => onChange({ backdrop })}
        />
        <SliderField
          label="人物强度"
          readout={formatPercent(spec.model)}
          min={PARALLAX_MIN}
          max={PARALLAX_MAX}
          step={PARALLAX_STEP}
          value={Number.isFinite(spec.model) ? spec.model : 0}
          onChange={(model) => onChange({ model })}
        />
      </div>
    </Group>
  )
}

// The accent is shared by every audio-reactive effect (spectrum bars, ambient
// bubbles, pointer trails); the clock and album card colour themselves from
// their own `theme`, so it is presented once, above the tabs.
//
// No `input type="color"` anywhere: it opens the OS colour dialog, which
// Wallpaper Engine's CEF host cannot host (the same popup trap as `<select>`).
// `ColorField` expands an in-page picker instead.
function AccentField({ value, onChange }) {
  return (
    <div className="ws-accent-block">
      <ColorField label="主题色" value={value ?? ''} fallback="#a8c4ff" onChange={onChange} allowInherit={false} />
    </div>
  )
}

// Full config document, ready to replace wallpaper.config.json: every key of
// the live config, with the two layer transforms and the overlay block
// overwritten by what the drawer is showing right now. Key order follows the
// built-in object, so the clipboard content is diff-stable against the shipped
// file.
function configJson(config, spec, overlay) {
  const layer = (item) => ({
    scale: round2(item.scale),
    offsetX: Math.round(item.offsetX),
    offsetY: Math.round(item.offsetY),
  })
  const parallax = spec.parallax ?? {}
  const payload = {
    _readme: CONFIG_README,
    ...config,
    backdropTransform: layer(spec.backdrop),
    modelTransform: layer(spec.model),
    parallax: {
      enabled: parallax.enabled !== false,
      backdrop: round2(parallax.backdrop ?? 0),
      model: round2(parallax.model ?? 0),
    },
    overlay,
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

const TABS = [{ key: 'composition', label: '构图' }, ...OVERLAY_TABS]

// localStorage slot holding the last snapshot: `{ at: ISO string, text: string }`.
// A Wallpaper Engine web project usually runs on a file:// / localhost origin
// where storage may be blocked, so every access is guarded and the snapshot is
// still copied even when storing fails.
const RECORD_KEY = 'wallpaper.config.record'

const pad = (value) => String(value).padStart(2, '0')
const clockLabel = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

export default function WallpaperSettings({
  open,
  design,
  config,
  spec,
  overlay,
  source,
  onChange,
  onOverlayChange,
  onAccentChange,
  onReset,
  onClose,
}) {
  const [flash, setFlash] = useState('')
  const [lastAt, setLastAt] = useState('')
  const [tab, setTab] = useState('composition')
  const timerRef = useRef(0)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  // Show when the previous snapshot was taken, so "记录" is not a black box.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECORD_KEY)
      const at = raw ? JSON.parse(raw).at : ''
      if (at) setLastAt(clockLabel(new Date(at)))
    } catch {
      setLastAt('')
    }
  }, [])

  // Recording is the whole point of the drawer: tune by eye, keep a snapshot,
  // then replace the file with what is on the clipboard.
  const handleRecord = async () => {
    const text = configJson(config, spec, overlay)
    const at = new Date()
    let stored = false
    try {
      window.localStorage.setItem(RECORD_KEY, JSON.stringify({ at: at.toISOString(), text }))
      stored = true
    } catch {
      stored = false
    }

    let copied = false
    try {
      await navigator.clipboard.writeText(text)
      copied = true
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      try {
        copied = document.execCommand('copy')
      } catch {
        copied = false
      }
      document.body.removeChild(area)
    }

    if (stored) setLastAt(clockLabel(at))
    const parts = [stored ? '已记录' : '记录失败', copied ? '已复制' : '复制失败']
    setFlash(`${parts.join(' · ')}（${clockLabel(at)}）`)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setFlash(''), 4000)
  }

  const enabledWidgets = TABS.filter((item) => item.key !== 'composition' && overlay?.[item.key]?.enabled)

  return (
    <aside className={`wallpaper-settings${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="ws-head">
        <div>
          <h2>壁纸设置</h2>
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

      <AccentField value={overlay?.accent} onChange={onAccentChange} />

      <div className="ws-tabs" role="tablist" aria-label="设置分组">
        {TABS.map((item) => {
          const active = tab === item.key
          const dot = item.key !== 'composition' && overlay?.[item.key]?.enabled
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`ws-tab${active ? ' is-active' : ''}`}
              onClick={() => setTab(item.key)}
            >
              {dot && <i className="ws-tab-dot" aria-hidden="true" />}
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="ws-body" role="tabpanel">
        {tab === 'composition' ? (
          <>
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
            <ParallaxGroup
              spec={spec.parallax ?? {}}
              onChange={(patch) => onChange('parallax', patch)}
              onReset={() => onReset('parallax')}
            />
            <p className="ws-note">
              偏移单位为设计画布像素（与 {CONFIG_FILE} 一致），平移不会被缩放放大。
              1× 时背景正好等于画布，拖出去的部分会露出模糊补边；想铺满整屏就先放大再拖。
              控件的位置在各自的 tab 里调，用的是视口百分比，与这里的画布坐标无关。
            </p>
            {enabledWidgets.length === 0 && (
              <p className="ws-note">当前没有任何控件浮层开启；需要的话在对应 tab 里打开。</p>
            )}
          </>
        ) : (
          <OverlaySettings tab={tab} overlay={overlay} onChange={onOverlayChange} onReset={onReset} />
        )}
      </div>

      <div className="ws-foot">
        <div className="ws-actions">
          <button type="button" className="ws-btn" onClick={() => onReset('all')}>
            全部重置
          </button>
          <button type="button" className="ws-btn is-primary" onClick={handleRecord}>
            记录配置
          </button>
        </div>
        <p className={`ws-status${flash ? ' is-flash' : ''}`} aria-live="polite">
          {flash || (lastAt ? `上次记录 ${lastAt} · 写入浏览器存储并复制到剪贴板` : '记录到浏览器存储，并复制到剪贴板')}
        </p>
      </div>
    </aside>
  )
}
