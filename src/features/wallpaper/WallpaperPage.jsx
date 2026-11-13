// Root route ('/'): a full-viewport wallpaper with ONE fixed model over its
// matching backdrop, with a fixed composition.
//
// Geometry: `design` is a fixed virtual canvas (by default the backdrop's
// native pixel size). The backdrop <img> and the WebGL canvas are BOTH children
// of that canvas, so they share one CSS transform. Only that single transform
// reacts to screen size / aspect ratio; everything inside is resolution
// independent.
//
// Chrome: none by default (plus a plain text line on failure). WallKit control
// overlays (clock / spectrum / album card / particles / pointer effects) are
// opt-in through the `overlay` config section and anchored to the viewport, so
// they are independent of the composition. The composition drawer stays hidden
// until the user clicks the bottom-right button or presses `S`; it only mirrors
// the two layer adjustments so they can be tuned by eye and copied into config.js.
//
// Defaults live in two layers: the built-in object in config.js, and the
// external `wallpaper.config.json` that ships next to index.html. The file is
// fetched once on mount and deep-merged on top of the built-in values, so a
// built dist/ can be retuned without rebuilding. Nothing is rendered until that
// fetch settles (success or fallback), otherwise the model would load twice.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { models } from 'virtual:model-library'
import SpineStage from '../../lib/spine/SpineStage.jsx'
import { pickDefaultAnimation, pickDefaultExpression } from '../../lib/animation.js'
import { assetUrl } from '../../lib/assets.js'
import WallpaperSettings from './components/WallpaperSettings.jsx'
import SettingsBoundary from './components/SettingsBoundary.jsx'
import WallpaperOverlay from './components/WallpaperOverlay.jsx'
import {
  WALLPAPER,
  loadWallpaperConfig,
  resolveWallpaperModel,
  pickBackdrop,
  resolveDesign,
  designScale,
  resolveLayerTransform,
} from './config.js'

const readViewport = () => ({ width: window.innerWidth, height: window.innerHeight })

// Config specs may use design pixels or '10%'; the drawer always works with
// resolved design pixels, so both spellings start from the same numbers.
function toTweak(spec, design) {
  const { scale, dx, dy } = resolveLayerTransform(spec, design)
  return { scale, offsetX: dx, offsetY: dy }
}

export default function WallpaperPage() {
  // `null` until the external config settles; `config` is then the merged
  // result. Falling back here keeps the component usable on the very first
  // render (hooks must stay unconditional).
  const [loaded, setLoaded] = useState(null)
  useEffect(() => {
    let alive = true
    loadWallpaperConfig().then((result) => {
      if (alive) setLoaded(result)
    })
    return () => {
      alive = false
    }
  }, [])

  const ready = Boolean(loaded)
  const config = loaded?.config ?? WALLPAPER

  const model = useMemo(() => {
    const override = new URLSearchParams(window.location.search).get('model') ?? ''
    return resolveWallpaperModel(models, override, config.modelId)
  }, [config])
  const backdrop = useMemo(() => pickBackdrop(model, config.backdrop), [model, config])
  const design = useMemo(() => resolveDesign(backdrop, config.design), [backdrop, config])
  const backdropUrl = useMemo(() => (backdrop ? assetUrl(backdrop.url) : ''), [backdrop])
  // Both adjustments resolve to design-canvas pixels, so the numbers below are
  // independent of the screen. The backdrop uses a CSS transform; the model
  // applies the SAME tuple inside the WebGL camera (see SpineStage).
  // The drawer edits these two tuples live; they start as the configured values.
  const configTweaks = useMemo(
    () => ({
      backdrop: toTweak(config.backdropTransform, design),
      model: toTweak(config.modelTransform, design),
    }),
    [config, design],
  )
  const [tweaks, setTweaks] = useState(configTweaks)
  // Adopt the configured defaults as soon as they arrive (or change, e.g. when
  // the chosen backdrop changes the design canvas).
  useEffect(() => setTweaks(configTweaks), [configTweaks])

  // The WallKit overlay settings are edited live too (size / position / colour /
  // per-widget options), with the same rule: config file wins until the drawer
  // is touched, and nothing is persisted.
  const configOverlay = config.overlay
  const [overlayTweaks, setOverlayTweaks] = useState(configOverlay)
  useEffect(() => setOverlayTweaks(configOverlay), [configOverlay])

  const [settingsOpen, setSettingsOpen] = useState(false)

  const backdropT = useMemo(() => resolveLayerTransform(tweaks.backdrop, design), [tweaks.backdrop, design])
  const modelT = useMemo(() => resolveLayerTransform(tweaks.model, design), [tweaks.model, design])
  // Both layers render on a surface slightly larger than the design canvas, so
  // panning / enlarging stops cutting them off with a visible straight edge at
  // the canvas bounds (the viewport does the clipping instead).
  const overscan = config.overscan > 1 ? config.overscan : 1
  const overscanInset = `${-((overscan - 1) / 2) * 100}%`
  const stageDesign = useMemo(
    () => ({ ...design, model: config.model, transform: modelT, overscan }),
    [design, config, modelT, overscan],
  )

  const updateTweaks = useCallback((layer, patch) => {
    setTweaks((prev) => ({ ...prev, [layer]: { ...prev[layer], ...patch } }))
  }, [])

  // `key` is an overlay widget key ('clock' / 'spectrum' / …); the accent is a
  // scalar and gets its own setter.
  const updateOverlay = useCallback((key, patch) => {
    setOverlayTweaks((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }, [])

  const updateAccent = useCallback((accent) => {
    setOverlayTweaks((prev) => ({ ...prev, accent }))
  }, [])

  // Lets `resetTweaks` stay referentially stable while still seeing the latest
  // config-derived values (they change when the model / backdrop does).
  const configTweaksRef = useRef(configTweaks)
  configTweaksRef.current = configTweaks
  const configOverlayRef = useRef(configOverlay)
  configOverlayRef.current = configOverlay

  const resetTweaks = useCallback((target) => {
    const base = configTweaksRef.current
    const overlayBase = configOverlayRef.current
    if (target === 'all') {
      setTweaks({ ...base })
      setOverlayTweaks({ ...overlayBase })
      return
    }
    if (target === 'backdrop' || target === 'model') {
      setTweaks((prev) => ({ ...prev, [target]: { ...base[target] } }))
      return
    }
    // Any other target is an overlay widget key.
    if (overlayBase?.[target]) {
      setOverlayTweaks((prev) => ({ ...prev, [target]: { ...overlayBase[target] } }))
    }
  }, [])

  // `S` toggles the drawer, `Esc` closes it. Typing in a field must not steal
  // the shortcut.
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (event.key === 'Escape') setSettingsOpen(false)
        return
      }
      if (event.key === 's' || event.key === 'S') {
        event.preventDefault()
        setSettingsOpen((open) => !open)
      } else if (event.key === 'Escape') {
        setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const [viewport, setViewport] = useState(readViewport)
  useEffect(() => {
    const onResize = () => setViewport(readViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const scale = designScale(design, viewport, config.fit)
  const left = (viewport.width - design.width * scale) / 2
  const top = (viewport.height - design.height * scale) / 2

  const [info, setInfo] = useState(null)
  const [animation, setAnimation] = useState('')
  const [expression, setExpression] = useState('')
  const [message, setMessage] = useState('')

  const handleLoaded = useCallback(
    (next) => {
      if (!model || next.modelId !== model.id) return
      // infoReady stops SpineStage from re-reporting on every render.
      setInfo(next)
      setAnimation(config.animation ?? pickDefaultAnimation(next.animations))
      setExpression(config.expression ?? pickDefaultExpression(next.animations))
      setMessage('')
    },
    [model, config],
  )

  const handleError = useCallback((err) => {
    const text = err instanceof Error ? err.message : String(err)
    console.error('[wallpaper]', text)
    setMessage(text)
  }, [])

  return (
    <div className="wallpaper-page" style={{ backgroundColor: config.letterbox }}>
      {config.bleed && backdropUrl && (
        <div
          className="wallpaper-bleed"
          style={{ backgroundImage: `url("${backdropUrl}")` }}
          aria-hidden="true"
        />
      )}

      <div
        className="wallpaper-design"
        style={{
          width: design.width,
          height: design.height,
          left,
          top,
          transform: `scale(${scale})`,
        }}
      >
        {backdropUrl && (
          <img
            className="wallpaper-backdrop"
            src={backdropUrl}
            alt=""
            draggable="false"
            style={{
              transform: `translate(${backdropT.dx}px, ${backdropT.dy}px) scale(${backdropT.scale})`,
            }}
          />
        )}
        {/* Mounting only after the config settles avoids loading the model
            twice (built-in defaults, then the file's modelId). */}
        {ready && model && (
          <div className="wallpaper-surface" style={{ inset: overscanInset }}>
            <SpineStage
              model={model}
              animation={animation}
              expression={expression}
              skin={config.skin}
              playing
              speed={config.speed}
              loop
              zoom={config.zoom}
              showBones={false}
              showBounds={false}
              infoReady={Boolean(info)}
              fitToken={0}
              resetToken={0}
              interactive={false}
              showLoading={false}
              design={stageDesign}
              onLoaded={handleLoaded}
              onError={handleError}
            />
          </div>
        )}
      </div>

      {message && <p className="wallpaper-message">{message}</p>}
      {!model && <p className="wallpaper-message">model-library/ 里没有可识别的模型</p>}

      {/* Viewport-anchored, so the composition scale never moves the widgets.
          Renders nothing when every `overlay.*.enabled` is false. */}
      {ready && <WallpaperOverlay config={overlayTweaks} />}

      {!settingsOpen && (
        <button
          type="button"
          className="wallpaper-settings-toggle"
          onClick={() => setSettingsOpen(true)}
          aria-label="打开构图设置"
          title="构图设置（S）"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
            <circle cx="15" cy="7" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="15" cy="17" r="2" />
          </svg>
        </button>
      )}

      <SettingsBoundary open={settingsOpen}>
        <WallpaperSettings
          open={settingsOpen}
          design={design}
          config={config}
          spec={tweaks}
          overlay={overlayTweaks}
          source={loaded?.source ?? 'builtin'}
          onChange={updateTweaks}
          onOverlayChange={updateOverlay}
          onAccentChange={updateAccent}
          onReset={resetTweaks}
          onClose={() => setSettingsOpen(false)}
        />
      </SettingsBoundary>
    </div>
  )
}
