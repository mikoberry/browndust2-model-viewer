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
import { pickDefaultAnimation, pickDefaultExpression, resolveSequence } from '../../lib/animation.js'
import { assetUrl } from '../../lib/assets.js'
import WallpaperSettings from './components/WallpaperSettings.jsx'
import SettingsBoundary from './components/SettingsBoundary.jsx'
import WallpaperOverlay from './components/WallpaperOverlay.jsx'
import useParallax from './useParallax.js'
import useCompositionBlend from './useCompositionBlend.js'
import { t, useLocale } from '../../lib/i18n.js'
import {
  WALLPAPER,
  loadWallpaperConfig,
  resolveWallpaperModel,
  pickBackdrop,
  resolveDesign,
  designScale,
  resolveLayerTransform,
  resolveEntrance,
  clipFraming,
  resolveParallax,
} from './config.js'

const readViewport = () => ({ width: window.innerWidth, height: window.innerHeight })

// Passed to useParallax while an entrance sequence runs: a cutscene has its own
// camera, so the artwork must not drift with the pointer. Constant identity keeps
// the hook's effect from re-running on every render.
const PARALLAX_OFF = { enabled: false, backdrop: 0, model: 0 }

// Config specs may use design pixels or '10%'; the drawer always works with
// resolved design pixels, so both spellings start from the same numbers.
function toTweak(spec, design) {
  const { scale, dx, dy } = resolveLayerTransform(spec, design)
  return { scale, offsetX: dx, offsetY: dy }
}

export default function WallpaperPage() {
  // Re-render page-level chrome (play / settings hints, error line) on locale
  // switch; the drawer subscribes on its own.
  useLocale()
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
  // The design canvas always follows the GLOBAL `backdrop` pick. A clip may show
  // a different image, but the canvas — and therefore every design-pixel number
  // in the config — must not change when a shot swaps, or the whole composition
  // would jump.
  const baseBackdrop = useMemo(() => pickBackdrop(model, config.backdrop), [model, config])
  const design = useMemo(() => resolveDesign(baseBackdrop, config.design), [baseBackdrop, config])
  // Both adjustments resolve to design-canvas pixels, so the numbers below are
  // independent of the screen. The backdrop uses a CSS transform; the model
  // applies the SAME tuple inside the WebGL camera (see SpineStage).
  // The drawer edits these two tuples live; they start as the configured values.
  const configTweaks = useMemo(
    () => ({
      backdrop: toTweak(config.backdropTransform, design),
      model: toTweak(config.modelTransform, design),
      // Parallax is unit-free (percent of the design canvas), so it does not
      // depend on `design` — it is only carried in the same object so the
      // drawer and "记录配置" have one snapshot to work from.
      parallax: resolveParallax(config.parallax),
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

  // Click-to-play: edited live in the composition drawer, same rule as the
  // layer tweaks (config wins until touched, nothing persisted until 记录配置).
  // `enabled` gates whether the click is wired at all; `name` is the one-shot
  // animation played when the model is clicked.
  const configClickAnimation = config.clickAnimation ?? { enabled: false, name: '' }
  const [clickTweak, setClickTweak] = useState(configClickAnimation)
  useEffect(() => setClickTweak(configClickAnimation), [configClickAnimation])
  // Bumped on every click to make SpineStage replay the one-shot clip. The
  // actual animation name rides alongside as `clickAnimation` (config-derived),
  // so a click never re-renders the WebGL stage — only the token changes.
  const [clickToken, setClickToken] = useState(0)
  const handleStageClick = useCallback(() => {
    if (clickTweak.enabled && clickTweak.name) setClickToken((token) => token + 1)
  }, [clickTweak])

  const [settingsOpen, setSettingsOpen] = useState(false)

  // Model state reported by the stage. Declared up here because the entrance
  // playlist below needs the animation list.
  const [info, setInfo] = useState(null)
  const [animation, setAnimation] = useState('')
  const [expression, setExpression] = useState('')
  const [message, setMessage] = useState('')

  // ---- entrance sequence -------------------------------------------------
  // BD2 opens a character scene with a CHAIN of shots (cut_A -> cut_B ->
  // loop_2). Every clip carries its own backdrop / scale / offsets — the shots
  // are joined at playback time instead of being baked into one framing.
  // `sequence: 'auto'` derives the names from the model's animations.
  const sequence = useMemo(() => {
    const names = resolveSequence(config.sequence, info?.animations ?? [])
    if (!names.length || !info) return names
    const available = new Set(info.animations.map((item) => item.name))
    return names.filter((name) => available.has(name))
  }, [config.sequence, info])
  const sequenceKey = sequence.join('|')
  const [entranceDone, setEntranceDone] = useState(false)
  // Which shot is on screen right now, reported by the stage once per clip.
  const [stageClip, setStageClip] = useState('')
  // Bumped to replay the entrance from the first clip (no asset reload).
  const [sequenceToken, setSequenceToken] = useState(0)
  const replaySequence = useCallback(() => setSequenceToken((token) => token + 1), [])
  useEffect(() => {
    setEntranceDone(false)
    setStageClip('')
  }, [sequenceKey, sequenceToken, model?.id])
  const handleSequenceDone = useCallback(() => setEntranceDone(true), [])
  const handleSequenceStage = useCallback((name) => setStageClip(name), [])

  const entrance = useMemo(() => resolveEntrance(config.entrance, design), [config.entrance, design])
  // `autoplay: false` means the wallpaper opens on its resting composition and
  // the entrance only runs when asked for. A replay request (the round play
  // button, or the drawer's 重新播放) always wins over the flag.
  // The drawer may flip the switch live; `null` = follow the config file, so a
  // reloaded config is never shadowed by a stale copy of itself.
  const [autoplayOverride, setAutoplayOverride] = useState(null)
  const autoplay = autoplayOverride ?? entrance.autoplay
  const wantsEntrance = autoplay || sequenceToken > 0
  // Each clip's own framing only applies WHILE the entrance plays. Once the last
  // clip takes over, the wallpaper returns to its own 「构图」
  // (`backdropTransform` / `modelTransform`) — that is exactly what the debug
  // panel calls 「构图（循环时）」, and it is also the pair the drawer's sliders
  // edit. Keeping the last clip's framing forever would silently kill those
  // sliders, which is not what the two labels promise.
  const inEntrance = wantsEntrance && sequence.length > 0 && !entranceDone
  const activeClip = inEntrance ? stageClip || sequence[0] || '' : ''
  // Memoised: `clipFraming` builds a fresh object, and an unstable identity here
  // would restart the cross-fade on every render.
  const clip = useMemo(() => clipFraming(entrance, activeClip), [entrance, activeClip])
  const framingT = useMemo(
    () => (activeClip ? { backdrop: clip.backdropTransform, model: clip.modelTransform } : null),
    [activeClip, clip],
  )

  const backdropT = useMemo(() => resolveLayerTransform(tweaks.backdrop, design), [tweaks.backdrop, design])
  const modelT = useMemo(() => resolveLayerTransform(tweaks.model, design), [tweaks.model, design])
  const composedT = useMemo(() => ({ backdrop: backdropT, model: modelT }), [backdropT, modelT])
  const targetT = framingT ?? composedT

  // A clip may show a different backdrop image than the global pick. It is set
  // on the SAME <img>, so the CSS transform (and its custom properties) survive
  // the swap; every clip image is preloaded so the switch is not a blank frame.
  const activeBackdrop = useMemo(
    () => pickBackdrop(model, clip.backdrop || config.backdrop),
    [model, clip.backdrop, config.backdrop],
  )
  const backdropUrl = useMemo(() => (activeBackdrop ? assetUrl(activeBackdrop.url) : ''), [activeBackdrop])
  useEffect(() => {
    const { clips } = entrance
    for (const name of Object.keys(clips)) {
      const picked = pickBackdrop(model, clips[name].backdrop || config.backdrop)
      if (!picked) continue
      const img = new Image()
      img.src = assetUrl(picked.url)
    }
  }, [entrance, model, config.backdrop])

  // Both layers render on a surface slightly larger than the design canvas, so
  // panning / enlarging stops cutting them off with a visible straight edge at
  // the canvas bounds (the viewport does the clipping instead).
  const overscan = config.overscan > 1 ? config.overscan : 1
  const overscanInset = `${-((overscan - 1) / 2) * 100}%`
  // Parallax is written imperatively (CSS vars on the design canvas + a ref the
  // WebGL camera reads), never through React state: a 60fps drift must not
  // re-render the page. See useParallax.js.
  const designRef = useRef(null)
  const modelOffsetRef = useRef({ x: 0, y: 0 })
  // The camera reads the model layer from a ref, so the entrance cross-fade can
  // animate it without a render; `transform` stays as the first-paint value.
  const modelTransformRef = useRef(null)
  // State, not a ref: the blend hook has to re-run once the <img> exists.
  const [backdropEl, setBackdropEl] = useState(null)
  const stageDesign = useMemo(
    () => ({
      ...design,
      model: config.model,
      transform: modelT,
      transformRef: modelTransformRef,
      overscan,
      offsetRef: modelOffsetRef,
    }),
    [design, config, modelT, overscan],
  )
  useParallax({ design, parallax: inEntrance ? PARALLAX_OFF : tweaks.parallax, designRef, modelOffsetRef })
  useCompositionBlend({
    backdropEl,
    modelTransformRef,
    target: targetT,
    active: inEntrance,
    duration: entrance.blend,
  })

  const updateTweaks = useCallback((layer, patch) => {
    setTweaks((prev) => ({ ...prev, [layer]: { ...prev[layer], ...patch } }))
  }, [])

  const updateClick = useCallback((patch) => {
    setClickTweak((prev) => ({ ...prev, ...patch }))
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
  const configClickRef = useRef(configClickAnimation)
  configClickRef.current = configClickAnimation

  const resetTweaks = useCallback((target) => {
    const base = configTweaksRef.current
    const overlayBase = configOverlayRef.current
    if (target === 'all') {
      setTweaks({ ...base })
      setOverlayTweaks({ ...overlayBase })
      setClickTweak({ ...configClickRef.current })
      setAutoplayOverride(null)
      return
    }
    if (target === 'backdrop' || target === 'model' || target === 'parallax') {
      setTweaks((prev) => ({ ...prev, [target]: { ...base[target] } }))
      return
    }
    if (target === 'clickAnimation') {
      setClickTweak({ ...configClickRef.current })
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
        ref={designRef}
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
            ref={setBackdropEl}
            // The layer transform lives in CSS custom properties so the parallax
            // loop can append `--parallax-x/y` on the parent without fighting
            // React for the inline `transform` (see .wallpaper-backdrop).
            // They are written imperatively by useCompositionBlend (entrance
            // cross-fade); React must not own them, or the next render would
            // snap the backdrop back to the composed framing mid-fade.
          />
        )}
        {/* Mounting only after the config settles avoids loading the model
            twice (built-in defaults, then the file's modelId). */}
        {ready && model && (
          <div className="wallpaper-surface" style={{ inset: overscanInset }}>
            <SpineStage
              model={model}
              animation={animation}
              animationStart={Number(config.animationStart) || 0}
              expression={expression}
              // `null` while no entrance is running: an empty list is exactly
              // the stage's "just play `animation`" mode, so with autoplay off
              // the model opens on its idle loop and nothing is queued.
              sequence={inEntrance ? sequence : null}
              sequenceToken={sequenceToken}
              onSequenceDone={handleSequenceDone}
              onSequenceStage={handleSequenceStage}
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
              clickAnimation={clickTweak.enabled ? clickTweak.name : ''}
              clickToken={clickToken}
              onClick={handleStageClick}
              onLoaded={handleLoaded}
              onError={handleError}
            />
          </div>
        )}
      </div>

      {message && <p className="wallpaper-message">{message}</p>}
      {!model && <p className="wallpaper-message">{t('page.noModels')}</p>}

      {/* Viewport-anchored, so the composition scale never moves the widgets.
          Renders nothing when every `overlay.*.enabled` is false. */}
      {ready && <WallpaperOverlay config={overlayTweaks} />}

      {!settingsOpen && (
        <div className="wallpaper-tools">
          {/* Same call as the drawer's 「重新播放」, for when the entrance was
              missed. Only offered when the config plays it automatically — with
              `autoplay: false` the wallpaper is meant to stay on its resting
              composition and offer no way in. */}
          {autoplay && sequence.length > 0 && (
            <button
              type="button"
              className="wallpaper-play-toggle"
              onClick={replaySequence}
              aria-label={t('page.playEntrance')}
              title={t('page.playEntrance')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <path d="M9 6.5v11l9.5-5.5z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="wallpaper-settings-toggle"
            onClick={() => setSettingsOpen(true)}
            aria-label={t('page.openSettings')}
            title={t('page.settingsHint')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
              <circle cx="15" cy="7" r="2" />
              <circle cx="9" cy="12" r="2" />
              <circle cx="15" cy="17" r="2" />
            </svg>
          </button>
        </div>
      )}

      <SettingsBoundary open={settingsOpen}>
        <WallpaperSettings
          open={settingsOpen}
          design={design}
          config={config}
          spec={tweaks}
          overlay={overlayTweaks}
          sequence={sequence}
          entrance={entrance}
          autoplay={autoplay}
          activeClip={activeClip}
          source={loaded?.source ?? 'builtin'}
          clickAnimation={clickTweak}
          animations={info?.animations ?? []}
          onChange={updateTweaks}
          onClickChange={updateClick}
          onOverlayChange={updateOverlay}
          onAccentChange={updateAccent}
          onAutoplayChange={setAutoplayOverride}
          onReplaySequence={replaySequence}
          onReset={resetTweaks}
          onClose={() => setSettingsOpen(false)}
        />
      </SettingsBoundary>
    </div>
  )
}
