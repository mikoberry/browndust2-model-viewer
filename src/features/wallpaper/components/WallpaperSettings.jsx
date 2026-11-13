// Settings drawer for the wallpaper route. Two kinds of editing, both live:
//
//   1. the composition tab nudges the two picture layers (scale + offset) in
//      design-canvas units, so anything tuned here can be pasted into the
//      config verbatim and stays resolution independent;
//   2. one tab per WallKit control overlay (clock / spectrum / album card /
//      particles / pointer effects) edits that widget's size, position, colour
//      and its own options.
//
// The wallpaper itself must stay a chrome-free image, so this drawer is closed
// by default and opened by the bottom-right button or the `S` key.
//
// What 「记录配置」 means: it stores the COMPLETE config document in
// localStorage, and from then on the wallpaper LOADS THAT instead of
// `wallpaper.config.json` — so a hand-tuned wallpaper survives reloads, and
// keeps its tune when you switch to another wallpaper and back. The JSON file
// is therefore only the factory default ("what a fresh install shows"); this
// drawer's 「恢复首次默认」 throws the snapshot away to get back to it. The same
// text is also put on the clipboard, so it can still be pasted into the file
// when shipping a build with new defaults.

import { useEffect, useRef, useState } from 'react'
import {
  CONFIG_FILE,
  CONFIG_README,
  clearRecordedConfig,
  readRecordedConfig,
  saveRecordedConfig,
} from '../config.js'
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
// number maps 1:1 onto the config value the user will copy. Kept compact (no
// spaces around the separator) because the two offsets share one row.
function formatOffset(value, basis) {
  const percent = basis > 0 ? (value / basis) * 100 : 0
  return `${Math.round(value)}px · ${percent.toFixed(1)}%`
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
      {/* The two offsets sit side by side (like the parallax strengths): they are
          a pair — you nudge X and Y in the same breath — and the drawer has to
          fit the window height, since Wallpaper Engine has no mouse wheel. */}
      <div className="ws-pair">
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
      </div>
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

// Entrance sequence is played by the model itself, so the controls here are
// "play it again" plus one switch: whether it runs by itself on load. The
// playlist AND each clip's framing are read-only: names differ per model,
// tuning a shot needs a live background and the animation list, and Wallpaper
// Engine has neither a keyboard nor room for more sliders. Both are edited in
// the debug viewer's 构图 tab, which writes the same file.
//
// One row per clip so it is obvious that a sequence is a CHAIN of framings and
// not one shared zoom that "resets" on load.
function SequenceGroup({
  sequence,
  entrance,
  autoplay,
  activeClip,
  inEntrance,
  onAutoplayChange,
  onReplay,
}) {
  const list = Array.isArray(sequence) ? sequence : []
  const clips = entrance?.clips ?? {}
  const blend = Number(entrance?.blend ?? 0)
  const scale = (layer) => `${Number(layer?.scale ?? 1).toFixed(2)}×`
  return (
    <Group title="入场动画">
      <div className="ws-seq">
        <span
          className="ws-seq-list"
          title="在 wallpaper.config.json 的 sequence 里修改（也可写 'auto' 自动识别）；留空则只播放单个循环动画"
        >
          {list.length ? list.join(' → ') : '未配置（直接播放循环动画）'}
        </span>
        <button type="button" className="ws-btn" onClick={onReplay} disabled={!list.length}>
          重新播放
        </button>
      </div>
      {list.length > 0 && (
        <>
          {/* `autoplay` is not just a start-up flag: while it is on, the bare
              wallpaper also shows a round play button above the settings gear,
              because a cutscene is easy to miss and this drawer is hidden. */}
          <ToggleField
            label="启动时播放"
            checked={autoplay}
            onChange={onAutoplayChange}
          />
          <ul className="ws-clips">
            {list.map((name) => {
              const clip = clips[name]
              return (
                <li key={name} className={`ws-clip${name === activeClip ? ' is-active' : ''}`}>
                  <span className="ws-clip-name">{name}</span>
                  <span className="ws-clip-value">
                    {clip
                      ? `背景 ${scale(clip.backdropTransform)} · 人物 ${scale(clip.modelTransform)}`
                      : '原始画布（未单独配置）'}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <p className="ws-note">
        {autoplay
          ? '勾选「启动时播放」：加载完成后自动放一遍，右下角设置按钮上方会出现播放按钮，随时可重放。'
          : '不自动播放：打开就是上面的「构图」，设置按钮上方不显示播放按钮（这里的「重新播放」仍可用）。'}
        每段都有各自的背景 / 缩放 / 位置，播放时按顺序拼起来，段间过渡 {blend.toFixed(1)}s。
        最后一段开始后入场就结束：两层用 {blend.toFixed(1)}s 渐变回上面的「构图」，动画交回 `animation` 循环。
        {inEntrance ? ' 正在播放入场。' : ''} 这些数值在 <code>/spine-viewer</code> 的「构图」面板里调；
        本页的改动要点「记录配置」才会保存到下次启动。
      </p>
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

// Full config document, ready to become the user's snapshot (and, pasted back,
// to replace wallpaper.config.json): every key of the live config, with the two
// layer transforms, the entrance autoplay switch and the overlay block
// overwritten by what the drawer is showing right now. Key order follows the
// built-in object, so the clipboard content is diff-stable against the shipped
// file.
function configPayload(config, spec, overlay, autoplay) {
  const layer = (item) => ({
    scale: round2(item.scale),
    offsetX: Math.round(item.offsetX),
    offsetY: Math.round(item.offsetY),
  })
  const parallax = spec.parallax ?? {}
  return {
    _readme: CONFIG_README,
    ...config,
    backdropTransform: layer(spec.backdrop),
    modelTransform: layer(spec.model),
    parallax: {
      enabled: parallax.enabled !== false,
      backdrop: round2(parallax.backdrop ?? 0),
      model: round2(parallax.model ?? 0),
    },
    // Spread first so `blend` / `clips` keep their place in the file; only the
    // switch is authoritative here.
    entrance: {
      ...(config.entrance ?? {}),
      autoplay: autoplay !== false,
    },
    overlay,
  }
}

const TABS = [{ key: 'composition', label: '构图' }, ...OVERLAY_TABS]

const pad = (value) => String(value).padStart(2, '0')
const clockLabel = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

export default function WallpaperSettings({
  open,
  design,
  config,
  spec,
  overlay,
  sequence,
  entrance,
  autoplay,
  activeClip,
  inEntrance,
  source,
  onChange,
  onOverlayChange,
  onAccentChange,
  onAutoplayChange,
  onReplaySequence,
  onReset,
  onClose,
}) {
  const [flash, setFlash] = useState('')
  const [lastAt, setLastAt] = useState('')
  // A snapshot recorded in THIS session makes the stored config live without a
  // reload, so the header must say so right away.
  const [recordedNow, setRecordedNow] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [tab, setTab] = useState('composition')
  const timerRef = useRef(0)
  const restoreTimerRef = useRef(0)

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current)
      window.clearTimeout(restoreTimerRef.current)
    },
    [],
  )

  // Show when the previous snapshot was taken, so "记录" is not a black box.
  useEffect(() => {
    const recorded = readRecordedConfig()
    if (recorded?.at) setLastAt(clockLabel(new Date(recorded.at)))
  }, [])

  // Recording is what turns the shipped file into a mere default: the snapshot
  // is read back at startup, so it survives reloads and wallpaper switches.
  // The same text also goes to the clipboard, for the case where the tune
  // should become the new factory default of a build.
  const handleRecord = async () => {
    const payload = configPayload(config, spec, overlay, autoplay)
    const text = `${JSON.stringify(payload, null, 2)}\n`
    const at = new Date()
    const stored = saveRecordedConfig(payload, at.toISOString())

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

    if (stored) {
      setLastAt(clockLabel(at))
      setRecordedNow(true)
      setConfirmRestore(false)
    }
    const parts = [stored ? '已记录' : '记录失败（浏览器存储不可用）', copied ? '已复制' : '复制失败']
    setFlash(
      stored
        ? `${parts.join(' · ')}（${clockLabel(at)}）· 以后打开壁纸都按这份配置`
        : `${parts.join(' · ')}（${clockLabel(at)}）· 只有剪贴板里这一份，无法自动生效`,
    )
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setFlash(''), 4000)
  }

  // 「恢复首次默认」: drop the snapshot and reload, so the shipped JSON (or the
  // built-in object) applies again. Two-step instead of `confirm()` — Wallpaper
  // Engine's CEF host cannot host a modal dialog.
  const handleRestore = () => {
    if (!confirmRestore) {
      setConfirmRestore(true)
      window.clearTimeout(restoreTimerRef.current)
      restoreTimerRef.current = window.setTimeout(() => setConfirmRestore(false), 5000)
      return
    }
    window.clearTimeout(restoreTimerRef.current)
    clearRecordedConfig()
    setConfirmRestore(false)
    setRecordedNow(false)
    window.location.reload()
  }

  const activeSource = recordedNow || source === 'user' ? 'user' : source
  const sourceLabel =
    activeSource === 'user'
      ? `正在使用你记录的配置${lastAt ? `（${lastAt}）` : ''}`
      : activeSource === 'file'
        ? `默认值：${CONFIG_FILE}（还会被记录覆盖）`
        : '默认值：内置（未读到配置文件）'

  const enabledWidgets = TABS.filter((item) => item.key !== 'composition' && overlay?.[item.key]?.enabled)

  return (
    <aside className={`wallpaper-settings${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="ws-head">
        <div>
          <h2>壁纸设置</h2>
          <p>
            设计画布 {Math.round(design.width)} × {Math.round(design.height)}
          </p>
          <p className={`ws-source${activeSource === 'user' ? ' is-user' : ''}`}>{sourceLabel}</p>
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
            <SequenceGroup
              sequence={sequence}
              entrance={entrance}
              autoplay={autoplay}
              activeClip={activeClip}
              inEntrance={inEntrance}
              onAutoplayChange={onAutoplayChange}
              onReplay={onReplaySequence}
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
          {activeSource === 'user' && (
            <button
              type="button"
              className={`ws-btn${confirmRestore ? ' is-danger' : ''}`}
              onClick={handleRestore}
              title="丢弃本机记录的配置，回到壁纸自带的默认值（会重新加载页面）"
            >
              {confirmRestore ? '确认恢复？' : '恢复首次默认'}
            </button>
          )}
          <button type="button" className="ws-btn is-primary" onClick={handleRecord}>
            记录配置
          </button>
        </div>
        <p className={`ws-status${flash ? ' is-flash' : ''}`} aria-live="polite">
          {flash ||
            (lastAt
              ? `已记录 ${lastAt} · 之后打开 / 切换壁纸再切回都按这份配置`
              : '记录 = 保存到本机，此后打开壁纸按这份配置（文件只作为首次默认）')}
        </p>
      </div>
    </aside>
  )
}
