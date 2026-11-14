// Settings drawer for the wallpaper route. Two kinds of editing, both live:
//
//   1. the composition tab nudges the two picture layers (scale + offset) in
//      design-canvas units, so anything tuned here can be pasted into the
//      config verbatim and stays resolution independent;
//   2. one tab per WallKit control overlay (clock / spectrum / album card /
//      particles / pointer effects + spotlight) edits that widget's size,
//      position, colour and its own options.
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
import { ChipField, ColorField, Group, SliderField, ToggleField } from './settings-fields.jsx'
import LocaleSwitcher from './LocaleSwitcher.jsx'
import { t, useLocale } from '../../../lib/i18n.js'

const SCALE_MIN = 0.25
const SCALE_MAX = 5 // user cap: 500% of the composed size
const SCALE_STEP = 0.01

// Offsets are edited in PERCENT of the design canvas (user request): the
// sliders span ±200% (100% = one full canvas width / height). Internally the
// tweaks stay in design pixels — the slider only converts at its edges, so the
// recorded config keeps the same pixel numbers as before.
const OFFSET_LIMIT = 200

// Parallax strength is a percentage of the design canvas; ±20% is already a
// huge drift on a 2048px artwork, so the slider stops there.
const PARALLAX_MIN = -20
const PARALLAX_MAX = 20
const PARALLAX_STEP = 0.5

const round2 = (value) => Math.round(value * 100) / 100

const formatScale = (value) => `${Math.round(value * 100)}%`

const formatPercent = (value) => `${round2(value ?? 0)}%`

// Offsets are shown as a percentage of the design canvas first, with the
// underlying design pixels in parentheses (that is the number the config file
// stores). Kept compact (no spaces around the separator) because the two
// offsets share one row.
function formatOffset(percent, pixels) {
  return `${percent.toFixed(1)}% (${Math.round(pixels)}px)`
}

// Design-pixel offset -> percent of the design canvas, and back. `basis` is
// design.width for X and design.height for Y.
const offsetToPercent = (pixels, basis) => (basis > 0 ? (pixels / basis) * 100 : 0)
const offsetFromPercent = (percent, basis) => (percent / 100) * basis

function LayerGroup({ title, note, spec, design, onChange, onReset }) {
  return (
    <Group title={title} note={note} onReset={onReset}>
      <SliderField
        label={t('comp.scale')}
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
          label={t('comp.offsetX')}
          readout={formatOffset(
            offsetToPercent(spec.offsetX, design.width),
            spec.offsetX,
          )}
          min={-OFFSET_LIMIT}
          max={OFFSET_LIMIT}
          step={0.5}
          value={offsetToPercent(spec.offsetX, design.width)}
          onChange={(percent) => onChange({ offsetX: offsetFromPercent(percent, design.width) })}
        />
        <SliderField
          label={t('comp.offsetY')}
          readout={formatOffset(
            offsetToPercent(spec.offsetY, design.height),
            spec.offsetY,
          )}
          min={-OFFSET_LIMIT}
          max={OFFSET_LIMIT}
          step={0.5}
          value={offsetToPercent(spec.offsetY, design.height)}
          onChange={(percent) => onChange({ offsetY: offsetFromPercent(percent, design.height) })}
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
      title={t('comp.parallax')}
      onReset={onReset}
      note={t('comp.parallaxNote')}
    >
      <ToggleField
        label={t('comp.parallaxEnabled')}
        checked={spec.enabled !== false}
        onChange={(enabled) => onChange({ enabled })}
      />
      {/* Two strengths share one row: the drawer has to fit the window height
          (no wheel in Wallpaper Engine), and each slider is short enough. */}
      <div className="ws-pair">
        <SliderField
          label={t('comp.backdropStrength')}
          readout={formatPercent(spec.backdrop)}
          min={PARALLAX_MIN}
          max={PARALLAX_MAX}
          step={PARALLAX_STEP}
          value={Number.isFinite(spec.backdrop) ? spec.backdrop : 0}
          onChange={(backdrop) => onChange({ backdrop })}
        />
        <SliderField
          label={t('comp.modelStrength')}
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
// sequence is shown as a read-only `a → b → c` line, which is all the drawer
// needs: each clip's framing needs a live background and the animation list to
// judge, and Wallpaper Engine has neither a keyboard nor room for more sliders.
// Shot-by-shot framing is tuned in the debug viewer's 构图 tab, which writes the
// same file.
function SequenceGroup({ sequence, autoplay, onAutoplayChange, onReplay }) {
  const list = Array.isArray(sequence) ? sequence : []
  return (
    <Group title={t('comp.entrance')}>
      {/* `autoplay` is not just a start-up flag: while it is on, the bare
          wallpaper also shows a round play button above the settings gear,
          because a cutscene is easy to miss and this drawer is hidden. It also
          gates the sequence row, so turning it off collapses it. */}
      <ToggleField
        label={t('comp.autoplay')}
        checked={autoplay}
        onChange={onAutoplayChange}
      />
      {autoplay && (
        <div className="ws-seq">
          <span
            className="ws-seq-list"
            title={t('comp.seqHint')}
          >
            {list.length ? list.join(' → ') : t('comp.seqEmpty')}
          </span>
          <button type="button" className="ws-btn" onClick={onReplay} disabled={!list.length}>
            {t('comp.replay')}
          </button>
        </div>
      )}
      <p className="ws-note">
        {autoplay ? t('comp.autoplayOnNote') : t('comp.autoplayOffNote')}
      </p>
    </Group>
  )
}

// Click-to-play: a one-shot reaction. The switch gates whether a click on the
// model does anything; the animation is picked from the model's own clips.
// Facial `_faceN` tracks and idle loops (`loop` / `loop_2`) are filtered out —
// only the `cut_*` reaction clips are offered. Off by default because the host
// has to deliver mouse events at all (Wallpaper Engine: turn on mouse
// interaction for the wallpaper).
function ClickAnimationGroup({ clickAnimation, animations, onChange, onReset }) {
  const name = clickAnimation?.name ?? ''
  const enabled = clickAnimation?.enabled === true
  // Reaction clips only: drop the _faceN portrait tracks and the idle loops.
  const options = (animations ?? [])
    .map((item) => item?.name ?? item)
    .filter((item) => typeof item === 'string' && item && !/^_face\d+$/i.test(item) && !/^loop(_\d+)?$/i.test(item))
    .map((item) => ({ value: item, label: item }))
  return (
    <Group
      title={t('comp.clickTitle')}
      onReset={onReset}
      note={t('comp.clickNote')}
    >
      <ToggleField label={t('comp.clickEnabled')} checked={enabled} onChange={(value) => onChange({ enabled: value })} />
      {enabled && (
        <ChipField
          label={t('comp.clickWhich')}
          value={name}
          options={options}
          onChange={(value) => onChange({ name: value })}
        />
      )}
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
      <ColorField label={t('drawer.accent')} value={value ?? ''} fallback="#a8c4ff" onChange={onChange} allowInherit={false} />
    </div>
  )
}

// Test-only tab: nuke the browser storage so a wallpaper can be exercised from a
// clean slate. Two-step confirm (no `confirm()` in Wallpaper Engine's CEF host).
// Clearing localStorage drops the recorded config snapshot, so a reload then
// falls back to the shipped `wallpaper.config.json`.
function OtherPanel() {
  const [confirmKey, setConfirmKey] = useState('')
  const timerRef = useRef(0)

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current)
    },
    [],
  )

  const arm = (key) => {
    setConfirmKey(key)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setConfirmKey(''), 5000)
  }

  const clearAndReload = (key) => {
    window.clearTimeout(timerRef.current)
    try {
      if (key === 'local') window.localStorage.clear()
      else window.sessionStorage.clear()
    } catch {
      // Storage can be unavailable on some WE origins; clearing is best-effort.
    }
    setConfirmKey('')
    window.location.reload()
  }

  return (
    <Group title={t('comp.clearStorage')} note={t('comp.clearStorageNote')}>
      <div className="ws-actions">
        <button
          type="button"
          className={`ws-btn${confirmKey === 'local' ? ' is-danger' : ''}`}
          onClick={() => (confirmKey === 'local' ? clearAndReload('local') : arm('local'))}
        >
          {confirmKey === 'local' ? t('common.confirmClear') : t('comp.clearLocal')}
        </button>
        <button
          type="button"
          className={`ws-btn${confirmKey === 'session' ? ' is-danger' : ''}`}
          onClick={() => (confirmKey === 'session' ? clearAndReload('session') : arm('session'))}
        >
          {confirmKey === 'session' ? t('common.confirmClear') : t('comp.clearSession')}
        </button>
      </div>
    </Group>
  )
}

// Full config document, ready to become the user's snapshot (and, pasted back,
// to replace wallpaper.config.json): every key of the live config, with the two
// layer transforms, the entrance autoplay switch and the overlay block
// overwritten by what the drawer is showing right now. Key order follows the
// built-in object, so the clipboard content is diff-stable against the shipped
// file.
function configPayload(config, spec, overlay, autoplay, clickAnimation) {
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
    clickAnimation: {
      enabled: clickAnimation?.enabled === true,
      name: clickAnimation?.name ?? '',
    },
    overlay,
  }
}

const TABS = [
  { key: 'composition', label: () => t('comp.title') },
  ...OVERLAY_TABS,
  { key: 'other', label: () => t('widget.other') },
]

const pad = (value) => String(value).padStart(2, '0')
const clockLabel = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

export default function WallpaperSettings({
  open,
  design,
  config,
  spec,
  overlay,
  sequence,
  autoplay,
  source,
  clickAnimation,
  animations,
  onChange,
  onClickChange,
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

  // Subscribe to the locale so every label re-renders on switch.
  useLocale()

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
    const payload = configPayload(config, spec, overlay, autoplay, clickAnimation)
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
    const parts = [stored ? t('record.recorded') : t('record.recordFail'), copied ? t('record.copied') : t('record.copyFail')]
    setFlash(
      stored
        ? `${parts.join(' · ')}（${clockLabel(at)}）· ${t('record.storedNote')}`
        : `${parts.join(' · ')}（${clockLabel(at)}）· ${t('record.copyOnlyNote')}`,
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
      ? `${t('drawer.sourceUser')}${lastAt ? `（${lastAt}）` : ''}`
      : activeSource === 'file'
        ? `${t('drawer.sourceFile')}：${CONFIG_FILE}${t('drawer.sourceFileNote')}`
        : t('drawer.sourceBuiltin')

  const enabledWidgets = TABS.filter((item) => item.key !== 'composition' && overlay?.[item.key]?.enabled)

  return (
    <aside className={`wallpaper-settings${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="ws-head">
        <div>
          <h2>{t('drawer.title')}</h2>
          <p>
            {t('drawer.designCanvas')} {Math.round(design.width)} × {Math.round(design.height)}
          </p>
          <p className={`ws-source${activeSource === 'user' ? ' is-user' : ''}`}>{sourceLabel}</p>
        </div>
        <div className="ws-head-side">
          <LocaleSwitcher />
          <button type="button" className="ws-close" onClick={onClose} aria-label={t('drawer.close')}>
            ×
          </button>
        </div>
      </div>

      <AccentField value={overlay?.accent} onChange={onAccentChange} />

      <div className="ws-tabs" role="tablist" aria-label={t('drawer.title')}>
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
              {typeof item.label === 'function' ? item.label() : item.label}
            </button>
          )
        })}
      </div>

      <div className="ws-body" role="tabpanel">
        {tab === 'composition' ? (
          <>
            <LayerGroup
              title={t('comp.backdrop')}
              spec={spec.backdrop}
              design={design}
              onChange={(patch) => onChange('backdrop', patch)}
              onReset={() => onReset('backdrop')}
            />
            <LayerGroup
              title={t('comp.model')}
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
              autoplay={autoplay}
              onAutoplayChange={onAutoplayChange}
              onReplay={onReplaySequence}
            />
            <ClickAnimationGroup
              clickAnimation={clickAnimation}
              animations={animations}
              onChange={onClickChange}
              onReset={() => onReset('clickAnimation')}
            />
            {enabledWidgets.length === 0 && (
              <p className="ws-note">{t('drawer.noWidgets')}</p>
            )}
          </>
        ) : tab === 'other' ? (
          <OtherPanel />
        ) : (
          <OverlaySettings tab={tab} overlay={overlay} onChange={onOverlayChange} onReset={onReset} />
        )}
      </div>

      <div className="ws-foot">
        <div className="ws-actions">
          <button type="button" className="ws-btn" onClick={() => onReset('all')}>
            {t('drawer.resetAll')}
          </button>
          {activeSource === 'user' && (
            <button
              type="button"
              className={`ws-btn${confirmRestore ? ' is-danger' : ''}`}
              onClick={handleRestore}
              title={t('drawer.restoreHint')}
            >
              {confirmRestore ? t('common.confirmRestore') : t('drawer.restoreDefault')}
            </button>
          )}
          <button type="button" className="ws-btn is-primary" onClick={handleRecord}>
            {t('drawer.record')}
          </button>
        </div>
        <p className={`ws-status${flash ? ' is-flash' : ''}`} aria-live="polite">
          {flash ||
            (lastAt
              ? `${t('record.recorded')} ${lastAt} · ${t('record.statusHas')}`
              : t('record.statusEmpty'))}
        </p>
      </div>
    </aside>
  )
}
