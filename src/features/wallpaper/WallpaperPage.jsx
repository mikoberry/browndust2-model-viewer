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
// overlays (clock / spectrum / album card / particles / pointer effects /
// spotlight) are opt-in through the `overlay` config section and anchored to the
// viewport, so they are independent of the composition. The composition drawer
// stays hidden
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
import StatsHud from './components/StatsHud.jsx'
import SettingsBoundary from './components/SettingsBoundary.jsx'
import WallpaperOverlay from './components/WallpaperOverlay.jsx'
import FollowPrompt from './components/FollowPrompt.jsx'
import useParallax from './useParallax.js'
import useCompositionBlend from './useCompositionBlend.js'
import { t, useLocale } from '../../lib/i18n.js'
import { startAudioSim } from './audioSim.js'
import {
  WALLPAPER,
  loadWallpaperConfig,
  mergeConfig,
  resolveWallpaperModel,
  pickBackdrop,
  resolveDesign,
  designScale,
  effectiveOverscan,
  resolveLayerTransform,
  resolveEntrance,
  clipFraming,
  cameraAt,
  resolveParallax,
  normalizeVariants,
  resolveVariantId,
  applyVariant,
  variantLabel,
  FOLLOW_DISMISS_KEY,
  storageKey,
} from './config.js'

const readViewport = () => ({ width: window.innerWidth, height: window.innerHeight })

// Per-wallpaper storage key for the follow nudge; `FOLLOW_DISMISS_KEY` is only
// the base name (config.js owns both it and the namespace).
const FOLLOW_STORAGE_KEY = storageKey(FOLLOW_DISMISS_KEY)

// Config specs may use design pixels or '10%'; the drawer always works with
// resolved design pixels, so both spellings start from the same numbers.
function toTweak(spec, design) {
  const { scale, dx, dy } = resolveLayerTransform(spec, design)
  return { scale, offsetX: dx, offsetY: dy }
}

export default function WallpaperPage() {
  // Re-render page-level chrome (play / settings hints, error line) on locale
  // switch; the drawer subscribes on its own.
  const { locale } = useLocale()
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
  // `baseConfig` is the document as loaded (shipped file + the user's snapshot).
  // `config` is what actually renders: the base with the ACTIVE variant's
  // overrides applied. Only the drawing-side keys differ — `modelId`, `design`
  // and `fit` are not variant keys, so the model and the design canvas stay put
  // when a variant swaps the loop / backdrop (see lib/variants.js).
  const baseConfig = loaded?.config ?? WALLPAPER
  const variants = useMemo(() => normalizeVariants(baseConfig.variants), [baseConfig])
  const configVariantId = useMemo(() => resolveVariantId(baseConfig, variants), [baseConfig, variants])
  // `null` = follow the config; the drawer's chips set an override for this
  // session (「记录配置」 writes the chosen one back as the file's `variant`).
  const [variantOverride, setVariantOverride] = useState(null)
  const variantId = variantOverride ?? configVariantId
  const activeVariant = useMemo(
    () => variants.find((item) => item.id === variantId) ?? null,
    [variants, variantId],
  )
  const config = useMemo(() => applyVariant(baseConfig, activeVariant), [baseConfig, activeVariant])

  // Bottom-right 「切换立绘」 handle: cycles base → each variant → base, i.e. the
  // same list the drawer's chips show. One variant is already two looks, so the
  // button appears as soon as `variants` is non-empty — with none there is
  // nothing to switch and it stays hidden (same rule as the chip row).
  const looks = useMemo(
    () => [
      { id: '', label: t('comp.variantBase') },
      ...variants.map((item) => ({ id: item.id, label: variantLabel(item, locale) })),
    ],
    [variants, locale],
  )
  // The label goes in the tooltip, so the button previews where a click lands —
  // the only affordance it has, since it is a 32px disc at 25% opacity.
  const nextLook = useMemo(() => {
    const index = looks.findIndex((item) => item.id === variantId)
    return looks[(index + 1) % looks.length] ?? looks[0]
  }, [looks, variantId])

  const model = useMemo(() => {
    const override = new URLSearchParams(window.location.search).get('model') ?? ''
    return resolveWallpaperModel(models, override, config.modelId)
  }, [config])
  // The design canvas always follows the GLOBAL `backdrop` / `design` of the base
  // config — never a variant's. A variant may show a different image, but the
  // canvas is what every design-pixel number in the config is measured in; if a
  // switch resized it, the whole composition (and every tuned offset) would be
  // silently reinterpreted. `design: null` therefore keeps the BASE image's
  // native size even when a variant draws something else.
  const designBackdrop = useMemo(() => pickBackdrop(model, baseConfig.backdrop), [model, baseConfig])
  const design = useMemo(() => resolveDesign(designBackdrop, baseConfig.design), [designBackdrop, baseConfig])
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

  // Animation speed (top-level `speed`, a variant key): edited live in the
  // composition drawer next to the model scale, same rule as the layer tweaks
  // (config wins until touched, nothing persisted until 记录配置).
  const [speedTweak, setSpeedTweak] = useState(config.speed)
  useEffect(() => setSpeedTweak(config.speed), [config.speed])
  // Bumped on every click to make SpineStage replay the one-shot clip. The
  // actual animation name rides alongside as `clickAnimation` (config-derived),
  // so a click never re-renders the WebGL stage — only the token changes.
  const [clickToken, setClickToken] = useState(0)
  const handleStageClick = useCallback(() => {
    if (clickTweak.enabled && clickTweak.name) setClickToken((token) => token + 1)
  }, [clickTweak])

  const [settingsOpen, setSettingsOpen] = useState(false)

  // One-shot "follow / like / save" nudge. Armed by the FIRST close of the
  // settings drawer (open → closed), shown once EVER: the dismissal is
  // persisted in localStorage, so it never comes back in later sessions.
  // Storage is guarded — Wallpaper Engine origins may deny it, in which case
  // the nudge just repeats per session instead of sticking forever.
  // The key is namespaced by this build's model (see config.js): every
  // wallpaper greets its own viewers, and dismissing it on one does not silence
  // the others.
  const [showFollow, setShowFollow] = useState(false)
  const settingsEverOpenedRef = useRef(false)
  useEffect(() => {
    if (settingsOpen) {
      settingsEverOpenedRef.current = true
      return
    }
    // Only the transition out of a really-opened drawer arms the nudge; the
    // initial mount (never opened) must not trigger it.
    if (!settingsEverOpenedRef.current || showFollow) return
    let dismissed = false
    try {
      dismissed = window.localStorage.getItem(FOLLOW_STORAGE_KEY) === '1'
    } catch {
      // storage unavailable — treat as "not dismissed yet"
    }
    if (dismissed) return
    setShowFollow(true)
  }, [settingsOpen])
  const dismissFollow = useCallback(() => {
    setShowFollow(false)
    try {
      window.localStorage.setItem(FOLLOW_STORAGE_KEY, '1')
    } catch {
      // storage unavailable — the nudge may reappear next session
    }
  }, [])

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
  // Bumped to replay the entrance from the first clip (no asset reload).
  const [sequenceToken, setSequenceToken] = useState(0)
  const replaySequence = useCallback(() => setSequenceToken((token) => token + 1), [])
  // Which entrance run the "already played" flags below belong to. Built from the
  // BASE sequence, not the active look's: switching a display variant is a
  // costume change, not a new scene, so it must not replay the cutscene. The two
  // looks may legitimately declare different sequences (each skin has its own
  // cut) — those still decide what plays WHILE the entrance runs, they just no
  // longer count as "a different entrance", which used to reset `entranceDone`
  // and re-arm the whole chain on every 切换立绘.
  const entranceKey = useMemo(
    () => resolveSequence(baseConfig.sequence, info?.animations ?? []).join('|'),
    [baseConfig.sequence, info],
  )
  // Both the "done" flag and the shot reported by the stage belong to ONE run of
  // the sequence. Tagging them with that run (entrance + token + model) makes a
  // replay read as "nothing has played yet" in the SAME render the token bumps.
  // Clearing them from an effect ran one commit late, which left the previous
  // run's tail clip in `stageClip` for a frame — the stage then reported the old
  // clip's framing before clip 1, and that bounce was cross-faded.
  const entranceRun = `${entranceKey}|${sequenceToken}|${model?.id ?? ''}`
  const entranceRunRef = useRef(entranceRun)
  entranceRunRef.current = entranceRun
  const [entranceDoneRun, setEntranceDoneRun] = useState({ run: '', done: false })
  // Which shot is on screen right now, reported by the stage once per clip.
  const [stageClipRun, setStageClipRun] = useState({ run: '', name: '' })
  const entranceDone = entranceDoneRun.run === entranceRun && entranceDoneRun.done
  const stageClip = stageClipRun.run === entranceRun ? stageClipRun.name : ''
  const handleSequenceDone = useCallback(
    () => setEntranceDoneRun({ run: entranceRunRef.current, done: true }),
    [],
  )
  const handleSequenceStage = useCallback(
    (name) => setStageClipRun({ run: entranceRunRef.current, name }),
    [],
  )

  const entrance = useMemo(() => resolveEntrance(config.entrance, design), [config.entrance, design])

  // ---- camera moves (PV-style pan / zoom over the WHOLE picture) ----------
  // SpineStage reports (clip, elapsed) every rAF; the pose is written straight
  // onto the design element's transform — both layers are children, so one
  // write moves the whole picture and the composition invariant is untouched.
  // No React state at 60fps: refs carry the per-frame inputs.
  const entranceRef = useRef(entrance)
  entranceRef.current = entrance
  const clipDurations = useMemo(() => {
    const map = {}
    for (const item of info?.animations ?? []) map[item.name] = item.duration
    return map
  }, [info])
  const clipDurationsRef = useRef(clipDurations)
  clipDurationsRef.current = clipDurations
  // The mapped canvas scale (`scale(k)`), assigned after it is computed below.
  const camScaleRef = useRef(1)
  const camLastRef = useRef('')
  const handleSequenceFrame = useCallback((name, elapsed) => {
    const el = designRef.current
    if (!el) return
    const scale = camScaleRef.current
    const cam = name ? entranceRef.current.clips[name]?.camera : null
    const pose = cam ? cameraAt(cam, elapsed, clipDurationsRef.current[name] ?? 0) : null
    // The design element's transform-origin is its top-left corner, but the pan
    // offsets are relative to the picture's CENTRE and a zoom should keep that
    // centre put. Compensate: under origin 0 0, scale(z) pushes the centre by
    // (z-1)*size/2, so the translation must add it back.
    //
    // The half-size is the DESIGN canvas, a constant — never read it back from
    // `el.style.width`/`height`. Reading layout here every frame forced a
    // synchronous reflow on each camera frame, which is exactly why moving
    // cameras stuttered while a still composition did not. `translate3d` keeps
    // the whole picture on its own compositor layer, so the per-frame write is
    // a transform update only (no layout, no paint).
    let transform = `scale3d(${scale}, ${scale}, 1)`
    if (pose) {
      const cx = design.width / 2
      const cy = design.height / 2
      const tx = (pose.dx + cx * (1 - pose.zoom)) * scale
      const ty = (pose.dy + cy * (1 - pose.zoom)) * scale
      const z = scale * pose.zoom
      transform = `translate3d(${tx}px, ${ty}px, 0) scale3d(${z}, ${z}, 1)`
    }
    if (transform === camLastRef.current) return
    camLastRef.current = transform
    el.style.transform = transform
  }, [design.width, design.height])

  // ---- scene warm-up gate -------------------------------------------------
  // The FIRST entrance must not start while anything is still decoding — that
  // WAS the first-load stutter, and a manual replay never stuttered because by
  // then everything (model textures, backdrop bitmaps) was already hot.
  // `backdropReady` / `clipsReady` decode the global backdrop and every
  // entrance clip backdrop ahead of time; `info` arrives once the model asset
  // (skeleton + atlas) has loaded. A load failure or an empty model library
  // also counts as ready, so the cover always comes off.
  const [backdropReady, setBackdropReady] = useState(false)
  useEffect(() => {
    const url = designBackdrop ? assetUrl(designBackdrop.url) : ''
    if (!url) {
      setBackdropReady(true) // no backdrop configured: nothing to wait for
      return undefined
    }
    let alive = true
    const probe = new Image()
    probe.src = url
    const settle = () => {
      if (alive) setBackdropReady(true)
    }
    if (typeof probe.decode === 'function') probe.decode().then(settle, settle)
    else probe.onload = settle
    return () => {
      alive = false
    }
  }, [designBackdrop])

  // Dev-only WE audio simulator: `?sim=1` only ARMS the debug tab — playback
  // never starts on its own, the drawer's switch (or the chip) starts it. The
  // sim plays public/spitz.mp3 through a Web Audio graph and feeds
  // `window.__wallkitAudioFrame` the same 256-float shape the real WE bridge
  // writes, so the spectrum / beat widgets move in a plain browser. It yields
  // to real host frames (see audioSim.js). Browsers gate autoplay behind a
  // gesture, so the chip doubles as the click-to-start.
  const [debugArmed] = useState(
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('sim') === '1',
  )
  const [simEnabled, setSimEnabled] = useState(false)
  const [simState, setSimState] = useState(null) // null | blocked | playing | paused
  const simRef = useRef(null)
  useEffect(() => {
    if (!simEnabled) {
      setSimState(null)
      return undefined
    }
    const sim = startAudioSim()
    simRef.current = sim
    setSimState('blocked')
    sim
      .play()
      .then(() => setSimState('playing'))
      .catch(() => setSimState('blocked')) // stays until the chip is clicked
    return () => {
      sim.stop()
      simRef.current = null
    }
  }, [simEnabled])
  // Playing → pause; blocked/paused → play. Audio events drive the widget
  // side; this just keeps the chip label in step.
  const toggleSim = useCallback(() => {
    const sim = simRef.current
    if (!sim) return
    if (simState === 'playing') {
      sim.audio.pause()
      setSimState('paused')
      return
    }
    sim
      .play()
      .then(() => setSimState('playing'))
      .catch(() => setSimState('blocked'))
  }, [simState])


  const [clipsReady, setClipsReady] = useState(false)
  // Once the scene has opened, a later change (switching a display variant swaps
  // the clip backdrops) must NOT re-arm the warm-up gate: `sceneReady` going
  // false again would bring the full-screen loading cover back over a wallpaper
  // that is already on screen. Decoding still happens — the backdrop stack
  // decodes each incoming image before mounting it — it just no longer blocks.
  const clipsWarmRef = useRef(false)
  const markClipsReady = useCallback(() => {
    clipsWarmRef.current = true
    setClipsReady(true)
  }, [])
  useEffect(() => {
    const { clips } = entrance
    const urls = Object.keys(clips)
      .map((name) => pickBackdrop(model, clips[name].backdrop || config.backdrop))
      .filter(Boolean)
      .map((picked) => assetUrl(picked.url))
    if (!urls.length) {
      markClipsReady()
      return undefined
    }
    let alive = true
    let done = 0
    if (!clipsWarmRef.current) setClipsReady(false)
    for (const url of urls) {
      const img = new Image()
      img.src = url
      const settle = () => {
        if (!alive) return
        done += 1
        if (done >= urls.length) markClipsReady()
      }
      // `new Image()` alone only fetches bytes; decode() also warms the decoded
      // bitmap so the visual swap is a pure compositor operation.
      if (typeof img.decode === 'function') img.decode().then(settle, settle)
      else img.onload = settle
    }
    return () => {
      alive = false
    }
  }, [entrance, model, config.backdrop, markClipsReady])

  const [loadFailed, setLoadFailed] = useState(false)
  const sceneReady =
    !model || loadFailed || (Boolean(info) && backdropReady && clipsReady)
  // The entrance arms almost immediately after the scene is ready — just two
  // committed frames, so the stage has painted once under the still-opaque
  // cover. cut_A's frame 0 then starts BEHIND the cover (which fades over
  // 0.5s), so the resting composition is never shown on its own: what the
  // cover reveals is the entrance already in motion. Waiting longer (as an
  // earlier version did) exposed the resting framing for hundreds of ms.
  const [entranceArmed, setEntranceArmed] = useState(false)
  useEffect(() => {
    if (!sceneReady) {
      setEntranceArmed(false)
      return undefined
    }
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntranceArmed(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [sceneReady])
  // The cover itself is removed shortly after its fade ends.
  const [loadingGone, setLoadingGone] = useState(false)
  useEffect(() => {
    if (!sceneReady) {
      setLoadingGone(false)
      return undefined
    }
    const timer = setTimeout(() => setLoadingGone(true), 700)
    return () => clearTimeout(timer)
  }, [sceneReady])

  // `autoplay: false` means the wallpaper opens on its resting composition and
  // the entrance only runs when asked for. A replay request (the round play
  // button, or the drawer's 重新播放) always wins over the flag.
  // The drawer may flip the switch live; `null` = follow the config file, so a
  // reloaded config is never shadowed by a stale copy of itself.
  // The switch is GLOBAL by design: `entrance.autoplay` is not a variant key
  // (lib/variants.js strips it), so every look reads the same value and the
  // override can safely stay set while the user switches chips — there is only
  // one value to differ from. `blend` / per-clip framing stay per-variant.
  const [autoplayOverride, setAutoplayOverride] = useState(null)
  const autoplay = autoplayOverride ?? entrance.autoplay
  // Gated on the warm-up gate: before the scene is ready (and armed) the
  // sequence waits, so the opening cut never plays over cold resources.
  const wantsEntrance = sceneReady && entranceArmed && (autoplay || sequenceToken > 0)
  // Each clip's own framing only applies WHILE the entrance plays. Once the last
  // clip takes over, the wallpaper returns to its own 「构图」
  // (`backdropTransform` / `modelTransform`) — that is exactly what the debug
  // panel calls 「构图（循环时）」, and it is also the pair the drawer's sliders
  // edit. Keeping the last clip's framing forever would silently kill those
  // sliders, which is not what the two labels promise.
  const inEntrance = wantsEntrance && sequence.length > 0 && !entranceDone
  const activeClip = inEntrance ? stageClip || sequence[0] || '' : ''
  // True only for the first shot of a run: the stage has not reported a clip
  // yet, so clip 1 is on screen because it is `sequence[0]`, not because it
  // already started. Nothing of the entrance is visible before it, so BOTH the
  // framing and the backdrop image must switch to it as a hard cut — a fade
  // there is the "rest composition slides into clip 1 after the load screen"
  // artefact.
  const atEntranceStart = inEntrance && !stageClip
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

  // A clip may show a different backdrop image than the global pick. Clip
  // images are preloaded + decoded by the warm-up gate above, so a switch
  // never stalls on decode / first GPU upload.
  const activeBackdrop = useMemo(
    () => pickBackdrop(model, clip.backdrop || config.backdrop),
    [model, clip.backdrop, config.backdrop],
  )
  const backdropUrl = useMemo(() => (activeBackdrop ? assetUrl(activeBackdrop.url) : ''), [activeBackdrop])
  // Backdrop cross-fade. Swapping the single <img>'s src was a hard cut: the
  // old frame vanished immediately and the new one popped in after decode.
  // Instead up to TWO layers are stacked; a new one mounts ON TOP at opacity 0
  // (only after its image has decoded) and fades in over `entrance.blend`
  // seconds, then the layer underneath is pruned. The wrapper owns the
  // --backdrop-* custom properties, so both layers always share one transform.
  const [backdropLayers, setBackdropLayers] = useState([])
  const backdropLayerIdRef = useRef(0)
  useEffect(() => {
    if (!backdropUrl) {
      setBackdropLayers([])
      return undefined
    }
    let alive = true
    // Decode BEFORE mounting the incoming layer so the fade starts from a
    // fully decoded frame.
    const probe = new Image()
    probe.src = backdropUrl
    const mount = () => {
      if (!alive) return
      setBackdropLayers((prev) => {
        if (prev[prev.length - 1]?.url === backdropUrl) return prev
        const id = (backdropLayerIdRef.current += 1)
        // Clip 1 of the entrance replaces the resting backdrop with no fade:
        // the still frame it replaces was only there because the scene had not
        // started yet, and dissolving it is the visible half of the bug above.
        // The incoming bitmap is already decoded (`probe.decode` gated this
        // call), so dropping the old layer cannot flash an empty canvas.
        if (atEntranceStart) return [{ url: backdropUrl, id, fade: false }]
        // The very first layer must not fade (nothing is underneath it).
        return [...prev, { url: backdropUrl, id, fade: prev.length > 0 }].slice(-2)
      })
    }
    // Fall back to mounting anyway on decode failure, or the backdrop would
    // never appear at all.
    if (typeof probe.decode === 'function') probe.decode().then(mount, mount)
    else probe.onload = mount
    return () => {
      alive = false
    }
    // `atEntranceStart` is deliberately NOT a dependency: this effect belongs to
    // the image that is being swapped in, and that render's value is the one
    // that says whether the swap is a shot change or the entrance's first shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backdropUrl])
  const pruneBackdropLayers = useCallback(() => {
    setBackdropLayers((prev) => (prev.length > 1 ? prev.slice(-1) : prev))
  }, [])

  const [viewport, setViewport] = useState(readViewport)
  useEffect(() => {
    const onResize = () => setViewport(readViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Both layers render on a surface slightly larger than the design canvas, so
  // panning / enlarging stops cutting them off with a visible straight edge at
  // the canvas bounds (the viewport does the clipping instead). `effectiveOverscan`
  // grows that surface to still cover the whole viewport when the contain-fit
  // letterbox is wider than the configured margin (e.g. a square canvas on a
  // 16:9 screen), otherwise the model gets hard-clipped ~8% in from the edges.
  const overscan = effectiveOverscan(design, viewport, config.overscan > 1 ? config.overscan : 1)
  const overscanInset = `${-((overscan - 1) / 2) * 100}%`
  // Parallax is written imperatively (CSS vars on the design canvas + a ref the
  // WebGL camera reads), never through React state: a 60fps drift must not
  // re-render the page. See useParallax.js.
  const designRef = useRef(null)
  const modelOffsetRef = useRef({ x: 0, y: 0 })
  // The camera reads the model layer from a ref, so the entrance cross-fade can
  // animate it without a render; `transform` stays as the first-paint value.
  const modelTransformRef = useRef(null)
  // State, not a ref: the blend hook has to re-run once the stack exists. The
  // element is the WRAPPER (not an <img>): it owns --backdrop-*, and both
  // stacked layers inherit them, so a cross-fade moves both together.
  const [backdropStackEl, setBackdropStackEl] = useState(null)
  // The STATIC composition scale `scale(k)` (design canvas -> screen). The
  // render loop must render at `dpr * scale(k)` resolution to stay sharp, but
  // it must NOT track the per-frame camera zoom: the camera moves scale the
  // whole picture via CSS transform, and letting that reach the canvas bitmap
  // size rebuilt the WebGL buffer every frame (the stutter). Carried as a ref
  // so a viewport resize re-renders but the loop reads it without a re-render.
  const displayScaleRef = useRef(1)
  const stageDesign = useMemo(
    () => ({
      ...design,
      model: config.model,
      transform: modelT,
      transformRef: modelTransformRef,
      overscan,
      offsetRef: modelOffsetRef,
      displayScaleRef,
    }),
    [design, config, modelT, overscan],
  )
  // Parallax is written imperatively (CSS vars on the design canvas + a ref the
  // WebGL camera reads), never through React state: a 60fps drift must not
  // re-render the page. `suppress` (the entrance sequence) eases the drift to
  // zero instead of snapping it away — swapping the config object used to
  // re-run the hook and park both layers at neutral in ONE frame, which read
  // as a flash at every entrance start / end. See useParallax.js.
  useParallax({ design, parallax: tweaks.parallax, suppress: inEntrance, designRef, modelOffsetRef })
  useCompositionBlend({
    backdropEl: backdropStackEl,
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

  // Debug-tab overlay presets: each patch deep-merges onto the BUILT-IN
  // defaults, so applying one is a complete look rather than a delta on the
  // user's current tweaks (a preset can't inherit stale enabled flags).
  const applyOverlayPreset = useCallback((patch) => {
    setOverlayTweaks(mergeConfig(WALLPAPER.overlay, patch))
  }, [])

  // Lets `resetTweaks` stay referentially stable while still seeing the latest
  // config-derived values (they change when the model / backdrop does).
  const configTweaksRef = useRef(configTweaks)
  configTweaksRef.current = configTweaks
  const configOverlayRef = useRef(configOverlay)
  configOverlayRef.current = configOverlay
  const configClickRef = useRef(configClickAnimation)
  configClickRef.current = configClickAnimation
  const configSpeedRef = useRef(config.speed)
  configSpeedRef.current = config.speed

  // 「记录配置」 makes the snapshot live immediately: the in-memory document
  // becomes exactly what was just written. Without it the drawer keeps reading
  // the PRE-record config, so a switch you just turned off flipped back the
  // moment you left that chip and returned (the other chip still carried its own
  // value) — even though the stored snapshot was already correct.
  const handleRecorded = useCallback((nextConfig, stored) => {
    setLoaded((prev) => ({
      ...(prev ?? {}),
      config: nextConfig,
      source: stored ? 'user' : (prev?.source ?? 'builtin'),
    }))
  }, [])

  const resetTweaks = useCallback((target) => {
    const base = configTweaksRef.current
    const overlayBase = configOverlayRef.current
    if (target === 'all') {
      setTweaks({ ...base })
      setOverlayTweaks({ ...overlayBase })
      setClickTweak({ ...configClickRef.current })
      setSpeedTweak(configSpeedRef.current)
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
    if (target === 'speed') {
      setSpeedTweak(configSpeedRef.current)
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

  const scale = designScale(design, viewport, config.fit)
  // Camera-move driver reads this every frame (see handleSequenceFrame).
  camScaleRef.current = scale
  // The WebGL render loop reads this to size its drawing buffer at the STATIC
  // composition resolution, ignoring the transient camera zoom (see stageDesign).
  displayScaleRef.current = scale
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
    // A failed asset must not hold the loading cover up forever.
    setLoadFailed(true)
  }, [])

  // Switching a display variant changes props only — the model is already
  // loaded, so `handleLoaded` will never fire again and track 0 would keep the
  // previous loop. Re-derive it from the now-active config with the same rule: a
  // pinned name that the model does not have falls back to the auto pick, and ''
  // disables the track.
  useEffect(() => {
    if (!info) return
    const names = new Set(info.animations.map((item) => item.name))
    const pick = (value, fallback) =>
      value === '' ? '' : typeof value === 'string' && names.has(value) ? value : fallback
    setAnimation(pick(config.animation, pickDefaultAnimation(info.animations)))
    setExpression(pick(config.expression, pickDefaultExpression(info.animations)))
  }, [config.animation, config.expression, info])

  return (
    <div className="wallpaper-page" style={{ backgroundColor: config.letterbox }}>
      {ready && config.bleed && backdropUrl && (
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
          transform: `scale3d(${scale}, ${scale}, 1)`,
        }}
      >
        {/* Gated on `ready` like the stage: before the config settles this
            would otherwise paint the BUILT-IN model's backdrop (a square,
            untransformed frame) for a moment before switching to the real
            configuration. Up to two stacked layers share one wrapper-owned
            transform; a new layer fades in on top, the old one is pruned when
            the fade ends. */}
        {ready && backdropLayers.length > 0 && (
          <div className="wallpaper-backdrop-stack" ref={setBackdropStackEl}>
            {backdropLayers.map((layer, index) => {
              const isTop = index === backdropLayers.length - 1
              return (
                <img
                  key={layer.id}
                  className={`wallpaper-backdrop${layer.fade && isTop ? ' is-incoming' : ''}`}
                  style={layer.fade && isTop ? { animationDuration: `${Math.max(entrance.blend, 0.1)}s` } : undefined}
                  src={layer.url}
                  alt=""
                  draggable="false"
                  onAnimationEnd={isTop ? pruneBackdropLayers : undefined}
                />
              )
            })}
          </div>
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
              onSequenceFrame={handleSequenceFrame}
              skin={config.skin}
              playing
              speed={speedTweak}
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

      {/* Opt-in FPS / frame-time / heap readout (`?stats=1`, `#stats`, or
          localStorage 'bd2.stats' = '1'). Renders nothing otherwise, so
          viewers never see it. */}
      <StatsHud />

      {/* Full-screen warm-up cover: hides the cold first frames (model texture
          upload, backdrop decodes) and fades out once the scene can start
          without hitches. `pointer-events: none` keeps the chrome underneath
          clickable, and a load failure also lifts it so the error line shows. */}
      {!loadingGone && (
        <div
          className={`wallpaper-loading${sceneReady ? ' is-ready' : ''}`}
          style={{ backgroundColor: config.letterbox }}
          role="status"
        >
          <span className="stage-loading-spinner" />
          <span className="wallpaper-loading-text">{t('page.loading')}</span>
        </div>
      )}

      {!settingsOpen && (
        <div className={`wallpaper-tools${looks.length > 1 ? ' has-variants' : ''}`}>
          {/* Cycle to the next look. Deliberately a cycle rather than a picker:
              it is one hidden handle in the corner, and the drawer already has
              the explicit chips for choosing a specific one. */}
          {looks.length > 1 && (
            <button
              type="button"
              className="wallpaper-variant-toggle"
              onClick={() => setVariantOverride(nextLook.id)}
              aria-label={t('page.switchArtwork')}
              title={`${t('page.switchArtwork')} → ${nextLook.label}`}
            >
              {/* Two arrows chasing each other round a circle: reads as
                  "cycle through the looks" rather than "open a list". */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.5 12a8.5 8.5 0 0 1-14.2 6.3" />
                <path d="M3.5 12a8.5 8.5 0 0 1 14.2-6.3" />
                <path d="M14.1 5.7h3.6V2.1" />
                <path d="M9.9 18.3H6.3v3.6" />
              </svg>
            </button>
          )}
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

      {/* Full-viewport click catcher, JUST below the drawer (z 6 < 7): any
          click outside the drawer lands here and closes it, while clicks
          inside the drawer never reach it. The tools column is unmounted while
          the drawer is open, so nothing else competes for the click. */}
      {settingsOpen && (
        <div
          className="wallpaper-scrim"
          onClick={() => setSettingsOpen(false)}
          aria-hidden="true"
        />
      )}

      <SettingsBoundary open={settingsOpen}>
        <WallpaperSettings
          open={settingsOpen}
          design={design}
          // The BASE document: 「记录配置」 rewrites that one, storing the active
          // variant separately instead of baking its values into the base.
          config={baseConfig}
          spec={tweaks}
          overlay={overlayTweaks}
          sequence={sequence}
          autoplay={autoplay}
          source={loaded?.source ?? 'builtin'}
          clickAnimation={clickTweak}
          speed={speedTweak}
          animations={info?.animations ?? []}
          variants={variants}
          variantId={variantId}
          onVariantChange={setVariantOverride}
          onChange={updateTweaks}
          onClickChange={updateClick}
          onSpeedChange={setSpeedTweak}
          onOverlayChange={updateOverlay}
          onAccentChange={updateAccent}
          onAutoplayChange={setAutoplayOverride}
          onReplaySequence={replaySequence}
          onReset={resetTweaks}
          // A recording becomes the live document right away. Without this the
          // drawer keeps reading the PRE-record config, so a value you just
          // switched off came back the moment you left the chip and returned
          // (the variant still carried its old value) until a full reload.
          onRecorded={handleRecorded}
          onClose={() => setSettingsOpen(false)}
          // Debug tab (?sim=1, dev builds only): the WE audio simulator.
          debug={debugArmed}
          simState={simState}
          onSimToggle={() => setSimEnabled((value) => !value)}
          onApplyOverlayPreset={applyOverlayPreset}
        />
      </SettingsBoundary>

      {/* One-shot nudge, anchored above the bottom-right tools (same 16px
          inset, raised clear of the button column). Rendered outside the
          drawer so it survives the drawer unmounting. */}
      {showFollow && <FollowPrompt onDismiss={dismissFollow} />}

      {simState && (
        <button
          type="button"
          className="wallpaper-audio-sim"
          onClick={toggleSim}
        >
          <span className={`wallpaper-audio-sim-dot is-${simState}`} aria-hidden="true" />
          {t(
            simState === 'playing'
              ? 'audioSim.playing'
              : simState === 'paused'
                ? 'audioSim.paused'
                : 'audioSim.blocked',
          )}
        </button>
      )}
    </div>
  )
}
