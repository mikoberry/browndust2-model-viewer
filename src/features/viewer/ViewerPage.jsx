// Development / debug page, served at /spine-viewer.
// This is the full inspector UI; the root route is the bare wallpaper.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { models, warnings } from 'virtual:model-library'
import ModelSidebar from './components/ModelSidebar.jsx'
import Toolbar from './components/Toolbar.jsx'
import Inspector from './components/Inspector.jsx'
import Timeline from './components/Timeline.jsx'
import CompositionStage from './components/CompositionStage.jsx'
import { ANIM_AUTO, ANIM_OFF, DEFAULT_DESIGN, animToOption } from './components/CompositionPanel.jsx'
import SpineStage from '../../lib/spine/SpineStage.jsx'
import { pickDefaultAnimation, pickDefaultExpression, pickEntranceSequence } from '../../lib/animation.js'
import { assetUrl } from '../../lib/assets.js'
import { pickBackdrop } from '../../lib/backdrops.js'
import { resolveDesign, resolveLayerTransform } from '../../lib/composition.js'
import { applyVariant, normalizeVariants, resolveVariantId } from '../../lib/variants.js'

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// Composition preview defaults. They are replaced by public/wallpaper.config.json
// as soon as it loads — the panel edits the REAL config, not a private copy.
const COMPOSE_DEFAULTS = {
  on: false,
  // 'entrance' = framing used while the entrance sequence plays (one entry per
  // clip: cut_A / cut_B / loop_2 …), 'composed' = the wallpaper's resting framing.
  // Composed first: it is what the panel opens on (user preference).
  layer: 'composed',
  // Which half of the active framing the sliders edit.
  layerKey: 'model',
  // Clip being tuned by hand. `follow` = mirror the clip actually on screen.
  clip: '',
  follow: true,
  // true = play ONLY the selected clip on a loop (so one shot can be judged on
  // its own); the full chain then only runs from 「播放完整入场」.
  solo: false,
  backdrop: 'auto',
  // Design canvas override: { width, height } pins a scene resolution (the
  // default is 1080p, matching the wallpaper's built-in `design`); null = follow
  // the chosen backdrop's native pixel size. Mirrors the `design` key of
  // wallpaper.config.json.
  design: DEFAULT_DESIGN,
  backdropTransform: { scale: 1, offsetX: 0, offsetY: 0 },
  modelTransform: { scale: 1, offsetX: 0, offsetY: 0 },
  entrance: {
    // Whether the wallpaper plays the sequence by itself once the model loads.
    autoplay: true,
    blend: 0.9,
    // Keyed by animation name, exactly like the config file.
    clips: {},
  },
  sequence: '',
  // Pinned loop animation / expression, in the panel's sentinel encoding
  // (ANIM_AUTO = config null, ANIM_OFF = config '').
  animation: ANIM_AUTO,
  expression: ANIM_AUTO,
  // Seconds skipped at the head of the loop animation (config animationStart).
  animationStart: 0,
  clickAnimation: { enabled: false, name: '' },
}

const NEUTRAL_LAYER = { scale: 1, offsetX: 0, offsetY: 0 }

// Stage viewport shape: 'auto' fills the workspace (the original behaviour),
// '16:9' letterboxes a box with exactly the shape of a 1920×1080 screen inside
// it. The composition is resolution independent, so only the RATIO matters —
// 1366×768 and 1920×1080 show the same picture.
const STAGE_ASPECT = 16 / 9

// Largest 16:9 box that fits inside `box`, centred by the caller.
function fitAspect(box, aspect) {
  if (!(box.width > 0) || !(box.height > 0)) return null
  const width = Math.min(box.width, box.height * aspect)
  return { width, height: width / aspect }
}

// The wallpaper renders on a surface `overscan` times the design canvas; the
// preview has to match or the model would be cropped at the canvas edge.
const COMPOSE_OVERSCAN = 1.5

// The config file allows '10%' offsets; the panel works in plain design pixels,
// so a percentage is reduced to its number (and the copy writes pixels).
const toFinite = (value, fallback) => {
  const n = typeof value === 'string' ? Number(value.trim().replace(/%$/, '')) : value
  return Number.isFinite(n) ? n : fallback
}

const mergeLayer = (base, patch) => ({
  scale: toFinite(patch?.scale, base.scale),
  offsetX: toFinite(patch?.offsetX, base.offsetX),
  offsetY: toFinite(patch?.offsetY, base.offsetY),
})

// entrance.clips from the file -> the flat shape the sliders use. Keys are
// animation names, so a new clip simply appears as another row.
const mergeClips = (base, raw) => {
  if (!raw || typeof raw !== 'object') return base
  const out = { ...base }
  for (const [name, clip] of Object.entries(raw)) {
    if (!name) continue
    out[name] = {
      backdrop: typeof clip?.backdrop === 'string' ? clip.backdrop : '',
      backdropTransform: mergeLayer(NEUTRAL_LAYER, clip?.backdropTransform),
      modelTransform: mergeLayer(NEUTRAL_LAYER, clip?.modelTransform),
    }
  }
  return out
}

// The config keys this panel edits. They belong to a DISPLAY VARIANT (each set of
// `loop` + backdrop keeps its own framing); `design` is deliberately absent —
// the canvas is global, or every offset in the file would be reinterpreted on a
// switch. Everything else in `compose` (on / layer / layerKey / clip / solo) is
// pure UI state and never leaves the viewer.
const VIEW_KEYS = [
  'backdrop',
  'backdropTransform',
  'modelTransform',
  'entrance',
  'sequence',
  'animation',
  'expression',
  'animationStart',
  'clickAnimation',
]
const VIEW_KEY_SET = new Set(VIEW_KEYS)

// The editable slice of the panel state — i.e. the snapshot stored for a variant.
const viewOf = (state) => {
  const out = {}
  for (const key of VIEW_KEYS) out[key] = state[key]
  return out
}

// `entrance.autoplay` is GLOBAL (see GLOBAL_NESTED in lib/variants.js): a variant
// can never carry its own copy. The panel still edits it through the chip being
// shown, so the value has to be mirrored onto EVERY stored view at once —
// otherwise switching chips would show a checkbox the exported file can never
// reproduce (it only ever writes the top-level one).
const withAutoplay = (view, autoplay) =>
  view?.entrance && 'autoplay' in view.entrance
    ? { ...view, entrance: { ...view.entrance, autoplay } }
    : view

// Split an onPatch payload into "config values" (routed to the object being
// edited) and "UI only" (routed to compose alone).
function splitPatch(patch) {
  const ui = {}
  const view = {}
  for (const [key, value] of Object.entries(patch)) {
    if (VIEW_KEY_SET.has(key)) view[key] = value
    else ui[key] = value
  }
  return { ui, view }
}

// A config document -> the flat shape the sliders use. `prev` supplies fallbacks
// so a partial file (or a variant that only overrides two keys) still produces a
// complete view.
const configToView = (raw, prev = COMPOSE_DEFAULTS) => ({
  backdrop: typeof raw?.backdrop === 'string' ? raw.backdrop : prev.backdrop,
  backdropTransform: mergeLayer(prev.backdropTransform, raw?.backdropTransform),
  modelTransform: mergeLayer(prev.modelTransform, raw?.modelTransform),
  animation: animToOption(raw?.animation),
  expression: animToOption(raw?.expression),
  animationStart: toFinite(raw?.animationStart, 0),
  clickAnimation: {
    enabled: raw?.clickAnimation?.enabled === true,
    name: typeof raw?.clickAnimation?.name === 'string' ? raw.clickAnimation.name : '',
  },
  entrance: {
    autoplay: raw?.entrance?.autoplay !== false,
    blend: toFinite(raw?.entrance?.blend, prev.entrance.blend),
    clips: mergeClips(prev.entrance.clips, raw?.entrance?.clips),
  },
  sequence: Array.isArray(raw?.sequence)
    ? raw.sequence.filter((name) => typeof name === 'string').join(', ')
    : typeof raw?.sequence === 'string'
      ? raw.sequence
      : '',
})

function EmptyLibrary() {
  return (
    <div className="empty-library">
      <h1>Spine 模型查看器</h1>
      <p>
        <code>model-library/</code> 里还没有可识别的模型。
      </p>
      <pre>{`model-library/\n  <角色>/\n    <皮肤>/\n      xxx.skel     (或 xxx.json)\n      xxx.atlas\n      xxx.png      (图集页，可为 _2.png / _3.png …)\n  backdrops/\n    <6 位角色 ID>/ (可选背景图，按文件名自动关联)`}</pre>
      <p className="muted">放入素材后刷新页面即可，不需要复制到 public/。</p>
    </div>
  )
}

export default function ViewerPage({ onGoWallpaper }) {
  const [selectedId, setSelectedId] = useState(models[0]?.id ?? '')
  const selected = useMemo(
    () => models.find((item) => item.id === selectedId) ?? models[0] ?? null,
    [selectedId],
  )

  const [info, setInfo] = useState(null)
  const [tab, setTab] = useState('animations')
  const [animation, setAnimation] = useState('')
  const [expression, setExpression] = useState('')
  const [skin, setSkin] = useState('')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [showBones, setShowBones] = useState(false)
  const [showBounds, setShowBounds] = useState(false)
  const [fitToken, setFitToken] = useState(0)
  const [resetToken, setResetToken] = useState(0)
  const [progress, setProgress] = useState({ time: 0, duration: 0, percent: 0 })
  const [stats, setStats] = useState({ fps: 0 })
  const [error, setError] = useState(null)
  const [bgMode, setBgMode] = useState('checker')
  const [backdropUrl, setBackdropUrl] = useState('')
  const [seek, setSeek] = useState({ value: 0, token: 0 })
  const seekTokenRef = useRef(0)
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  // Latest model info for callbacks that must stay referentially stable but
  // still see fresh values (model load vs config fetch race). fileConfigRef
  // lives below, next to its state declaration.
  const infoRef = useRef(null)
  infoRef.current = info

  // ---- composition preview -----------------------------------------------
  const [compose, setCompose] = useState(COMPOSE_DEFAULTS)
  // ---- display variants ---------------------------------------------------
  // One model, several alternative looks (`loop` on back1, `loop_2` on back2).
  // `baseView` is what 「基础」 edits; every variant stores a COMPLETE view of the
  // same shape, so switching is a straight copy instead of a merge — otherwise a
  // variant that omitted a key would inherit whatever the previously selected
  // one happened to hold. Hand-written minimal overrides are folded in with
  // `applyVariant` on load, so they arrive here complete too.
  const [baseView, setBaseView] = useState(() => viewOf(COMPOSE_DEFAULTS))
  const [variants, setVariants] = useState([])
  const [editing, setEditing] = useState('')
  // Which variant the file's `variant` key points at — written back by 「设为默认」.
  const [defaultVariant, setDefaultVariant] = useState('')
  const baseViewRef = useRef(baseView)
  baseViewRef.current = baseView
  const variantsRef = useRef(variants)
  variantsRef.current = variants
  const editingRef = useRef('')
  editingRef.current = editing
  const composeRef = useRef(compose)
  composeRef.current = compose
  const [fileConfig, setFileConfig] = useState(null)
  const fileConfigRef = useRef(null)
  fileConfigRef.current = fileConfig
  const [composeToken, setComposeToken] = useState(0)
  const [composeFlash, setComposeFlash] = useState('')
  const flashTimerRef = useRef(0)

  // Prefill from the shipped wallpaper config so the panel shows what the
  // wallpaper actually uses. Never blocks: a missing / unreadable file (dist on
  // file://) simply keeps the neutral defaults.
  useEffect(() => {
    let alive = true
    const url = new URL('wallpaper.config.json', document.baseURI).href
    fetch(url, { cache: 'no-cache' })
      .then((response) => (response.ok ? response.json() : null))
      .then((raw) => {
        if (!alive || !raw) return
        setFileConfig(raw)
        // Variants: the file may carry minimal overrides, so fold each one onto
        // the base with `applyVariant` and store the resulting COMPLETE view.
        const parsed = normalizeVariants(raw.variants)
        const base = configToView(raw)
        const list = parsed.map((item) => ({
          id: item.id,
          label: item.label ?? '',
          view: configToView(applyVariant(raw, item)),
        }))
        const initial = resolveVariantId(raw, list)
        const initialView = initial ? list.find((item) => item.id === initial)?.view : null
        setBaseView(base)
        setVariants(list)
        setDefaultVariant(initial)
        setEditing(initial)
        setCompose((prev) => ({
          ...prev,
          ...base,
          ...(initialView ?? {}),
          // `design` is global (never per variant): null = follow the image.
          design:
            toFinite(raw.design?.width, 0) > 0 && toFinite(raw.design?.height, 0) > 0
              ? { width: toFinite(raw.design.width, 0), height: toFinite(raw.design.height, 0) }
              : null,
        }))
        // The model usually loads after this fetch, but a cached asset can win
        // the race. If one is already on screen and it is the config's model,
        // re-apply the ACTIVE variant's animation picks so the stage plays what
        // the panel shows (handleLoaded had no config to read at that point).
        const current = infoRef.current
        if (current && raw.modelId === current.modelId) {
          const active = initial ? parsed.find((item) => item.id === initial) : null
          const activeConfig = active ? applyVariant(raw, active) : raw
          const names = new Set(current.animations.map((item) => item.name))
          if (typeof activeConfig.animation === 'string' && names.has(activeConfig.animation)) {
            setAnimation(activeConfig.animation)
          }
          if (typeof activeConfig.expression === 'string' && names.has(activeConfig.expression)) {
            setExpression(activeConfig.expression)
          }
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => () => window.clearTimeout(flashTimerRef.current), [])

  // Pin the animation / expression a panel view asks for onto the shared stage.
  // `animation` / `expression` are NOT per-target values: one skeleton is on
  // screen, so writing them into `compose` only moves the dropdown — the playing
  // track is `animation` / `expression` state, and only these setters move it.
  // Hence both pathways (editing a field, and switching the edited variant) have
  // to call this with the WHOLE view. Sentinels resolve against the current
  // model's clip list, so a variant tuned on another model degrades to the
  // default pick instead of pinning a name that does not exist.
  const applyAnimPicks = useCallback((view) => {
    const animations = infoRef.current?.animations ?? []
    if ('animation' in view) {
      setAnimation(
        view.animation === ANIM_AUTO
          ? pickDefaultAnimation(animations)
          : view.animation === ANIM_OFF
            ? ''
            : view.animation,
      )
    }
    if ('expression' in view) {
      setExpression(
        view.expression === ANIM_AUTO
          ? pickDefaultExpression(animations)
          : view.expression === ANIM_OFF
            ? ''
            : view.expression,
      )
    }
  }, [])

  const updateCompose = useCallback(
    (patch) => {
      setCompose((prev) => ({ ...prev, ...patch }))
      // Config values land on whatever is being edited (base or the active
      // variant); UI-only keys stay in compose.
      const { view } = splitPatch(patch)
      if (Object.keys(view).length) {
        // A global key reaches every look, not just the chip being edited.
        const autoplay =
          view.entrance && typeof view.entrance.autoplay === 'boolean' ? view.entrance.autoplay : undefined
        if (autoplay !== undefined) {
          setBaseView((prev) => withAutoplay(prev, autoplay))
          setVariants((list) => list.map((item) => ({ ...item, view: withAutoplay(item.view, autoplay) })))
        }
        const id = editingRef.current
        if (id) {
          setVariants((list) =>
            list.map((item) => (item.id === id ? { ...item, view: { ...item.view, ...view } } : item)),
          )
        } else {
          setBaseView((prev) => ({ ...prev, ...view }))
        }
      }
      // The composition preview shares `animation` / `expression` with the main
      // viewer stage, so pinning one from the panel plays it immediately.
      // `follow: false` rides along from the panel but is meaningless here.
      // `follow: false` rides along from the panel but is meaningless here.
      applyAnimPicks(view)
    },
    [applyAnimPicks],
  )

  // ---- variant actions -----------------------------------------------------
  // Switching the edit target is a copy of the stored view, not a merge: every
  // variant keeps a COMPLETE set of values, so what you see is exactly what that
  // chip holds. The view's `animation` / `expression` must also reach the stage —
  // otherwise the chip swaps the dropdowns and the backdrop while the skeleton
  // keeps looping the previous look.
  const handleEditingChange = useCallback(
    (id) => {
      const target = id
        ? variantsRef.current.find((item) => item.id === id)?.view
        : baseViewRef.current
      setEditing(id)
      if (!target) return
      setCompose((prev) => ({ ...prev, ...target }))
      applyAnimPicks(target)
    },
    [applyAnimPicks],
  )

  // A new variant starts as a copy of what is on screen, so it is immediately
  // previewable and tweakable (no "inherits everything until you touch it").
  // The default label mirrors the id (`v1`, `v2`, ...): it is what the chips
  // show and what the file records, so an untouched variant reads the same in
  // both places, and a short name fits more chips on one row.
  const handleVariantAdd = useCallback(() => {
    const list = variantsRef.current
    let n = list.length + 1
    while (list.some((item) => item.id === `v${n}`)) n += 1
    const id = `v${n}`
    setVariants((prev) => [...prev, { id, label: id, view: viewOf(composeRef.current) }])
    setEditing(id)
  }, [])

  const handleVariantRename = useCallback((id, label) => {
    setVariants((list) => list.map((item) => (item.id === id ? { ...item, label } : item)))
  }, [])

  // 「设为默认」 only decides which chip the wallpaper OPENS on (`variant` key).
  const handleVariantDefault = useCallback((id) => setDefaultVariant(id), [])

  const handleVariantRemove = useCallback(
    (id) => {
      setVariants((list) => list.filter((item) => item.id !== id))
      setDefaultVariant((prev) => (prev === id ? '' : prev))
      if (editingRef.current === id) {
        setEditing('')
        setCompose((prev) => ({ ...prev, ...baseViewRef.current }))
        // Falling back to the base look has to move the playing track too.
        applyAnimPicks(baseViewRef.current)
      }
    },
    [applyAnimPicks],
  )

  const availableNames = useMemo(
    () => new Set((info?.animations ?? []).map((item) => item.name)),
    [info],
  )
  // Names the current model actually has: the sequence preview and the drawer's
  // replay button both work off this list, never off the raw text.
  const playingSequence = useMemo(
    () =>
      compose.sequence
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name && availableNames.has(name)),
    [compose.sequence, availableNames],
  )

  // Clip the panel is editing. In solo mode the stage plays exactly this one,
  // so what you tune is what you see.
  const soloClip =
    compose.solo && compose.clip && playingSequence.includes(compose.clip) ? compose.clip : ''
  // What the stage queues: a single clip (looped, because a one-entry sequence
  // loops) while soloing, otherwise the whole chain.
  const previewSequence = useMemo(
    () => (soloClip ? [soloClip] : playingSequence),
    [soloClip, playingSequence],
  )

  // Which shot's framing to preview. `follow` mirrors the clip that is actually
  // playing (SpineStage reports it once per cut); otherwise the panel's own
  // selection wins, so a shot can be tuned while it is paused.
  const [stageClip, setStageClip] = useState('')
  const handleStageClip = useCallback((name) => setStageClip(name), [])
  // The sequence hands track 0 back once its last clip starts, and the wallpaper
  // returns to its composed framing at that moment. Mirror it: the panel jumps to
  // 「构图（循环时）」 so the sliders edit what is actually on screen.
  const handleSequenceDone = useCallback(() => {
    setCompose((prev) => (prev.solo ? prev : { ...prev, layer: 'composed' }))
  }, [])
  // Soloing one clip keeps that clip's framing on screen; otherwise the panel's
  // own layer choice decides.
  const entranceFraming = compose.layer === 'entrance'
  const previewClip = !entranceFraming
    ? ''
    : soloClip ||
      (compose.follow && stageClip ? stageClip : compose.clip || playingSequence[0] || '')
  const clipSpec = previewClip ? compose.entrance.clips[previewClip] ?? null : null

  // The design canvas follows the GLOBAL pick by default; a clip may draw a
  // different image but must not change the canvas, or every design-pixel
  // number in the config would mean something else. The panel may also PIN the
  // canvas to a scene resolution (compose.design), which wins over the image —
  // exactly like the wallpaper's `design` key.
  const composeBackdrop = useMemo(
    () => pickBackdrop(selected, compose.backdrop),
    [selected, compose.backdrop],
  )
  // The canvas is measured off the BASE backdrop, never the edited variant's:
  // that is what the wallpaper does (`design` is not a variant key), so a variant
  // showing another image must not resize the canvas under the preview.
  const designBackdrop = useMemo(
    () => pickBackdrop(selected, baseView.backdrop),
    [selected, baseView.backdrop],
  )
  const composeDesign = useMemo(
    () => resolveDesign(designBackdrop, compose.design),
    [designBackdrop, compose.design],
  )
  // The image actually drawn, which for a clip can be its own backdrop.
  const previewBackdrop = useMemo(
    () =>
      entranceFraming
        ? pickBackdrop(selected, clipSpec?.backdrop || compose.backdrop)
        : composeBackdrop,
    [entranceFraming, selected, clipSpec, compose.backdrop, composeBackdrop],
  )
  const composeBackdropT = useMemo(
    () =>
      resolveLayerTransform(
        entranceFraming ? clipSpec?.backdropTransform ?? NEUTRAL_LAYER : compose.backdropTransform,
        composeDesign,
      ),
    [entranceFraming, clipSpec, compose.backdropTransform, composeDesign],
  )
  const composeModelT = useMemo(
    () =>
      resolveLayerTransform(
        entranceFraming ? clipSpec?.modelTransform ?? NEUTRAL_LAYER : compose.modelTransform,
        composeDesign,
      ),
    [entranceFraming, clipSpec, compose.modelTransform, composeDesign],
  )
  const composeStageDesign = useMemo(
    () => ({
      width: composeDesign.width,
      height: composeDesign.height,
      model: { heightRatio: 1, widthRatio: 1, alignX: 0.5, alignY: 0.5 },
      transform: composeModelT,
      overscan: COMPOSE_OVERSCAN,
    }),
    [composeDesign, composeModelT],
  )

  const handleComposeDetect = useCallback(() => {
    const names = pickEntranceSequence(info?.animations ?? [])
    setCompose((prev) => ({ ...prev, sequence: names.join(', ') }))
  }, [info])

  const handleComposeReplay = useCallback(() => {
    // Full entrance: drop the solo selection so the stage queues the whole chain
    // again and the panel follows whatever shot is on screen.
    setStageClip('')
    setCompose((prev) => ({ ...prev, follow: true, solo: false, layer: 'entrance' }))
    setComposeToken((token) => token + 1)
  }, [])

  const handleComposeCopy = useCallback(async (text) => {
    let copied = false
    try {
      await navigator.clipboard.writeText(text)
      copied = true
    } catch {
      copied = false
    }
    setComposeFlash(
      copied ? '已复制。整份替换 public/wallpaper.config.json 即可。' : '复制失败，请检查浏览器剪贴板权限。',
    )
    window.clearTimeout(flashTimerRef.current)
    flashTimerRef.current = window.setTimeout(() => setComposeFlash(''), 6000)
  }, [])

  const selectModel = useCallback((id) => {
    // Clicking the already-selected model must be a no-op. Clearing the panel
    // state here would leave it empty: SpineStage only reports onLoaded when
    // the asset changes, and selecting the same model changes nothing.
    if (id === selectedIdRef.current) return
    setSelectedId(id)
    setInfo(null)
    setAnimation('')
    setExpression('')
    setSkin('')
    setPlaying(true)
    setZoom(1)
    setError(null)
    setProgress({ time: 0, duration: 0, percent: 0 })
    setBgMode('checker')
    setBackdropUrl('')
    setStageClip('')
    setFitToken((token) => token + 1)
  }, [])

  // The config file's animation / expression picks apply only to the model they
  // were tuned for: that is what the composition panel previews and copies, so
  // the stage must play the same thing. Any other selection keeps the
  // auto-picked defaults (auto names / missing names fall through).
  const configAnimationFor = (raw, info, fallback) => {
    const names = new Set(info.animations.map((item) => item.name))
    return fileConfigRef.current &&
      fileConfigRef.current.modelId === info.modelId &&
      typeof raw === 'string' &&
      names.has(raw)
      ? raw
      : fallback
  }

  const handleLoaded = useCallback((nextInfo) => {
    // A previous model can finish loading one commit late while the user is
    // switching models; never let it overwrite the new selection.
    if (nextInfo.modelId !== selectedIdRef.current) return
    setInfo(nextInfo)
    setAnimation(configAnimationFor(fileConfigRef.current?.animation, nextInfo, pickDefaultAnimation(nextInfo.animations)))
    setExpression(configAnimationFor(fileConfigRef.current?.expression, nextInfo, pickDefaultExpression(nextInfo.animations)))
    setSkin('')
    setPlaying(true)
    setError(null)
    setProgress({ time: 0, duration: 0, percent: 0 })
    // Entrance clip names are per model, so the sequence text follows the load
    // instead of whatever the previous model needed. Variants keep their own
    // chains on purpose (that is the whole point of a per-variant entrance), so
    // only the base and the object currently being edited are re-seeded.
    const names = pickEntranceSequence(nextInfo.animations)
    const sequence = names.join(', ')
    setStageClip('')
    setCompose((prev) => ({
      ...prev,
      sequence,
      clip: names[0] ?? '',
      follow: true,
      solo: false,
    }))
    setBaseView((prev) => ({ ...prev, sequence }))
    if (editingRef.current) {
      const id = editingRef.current
      setVariants((list) =>
        list.map((item) => (item.id === id ? { ...item, view: { ...item.view, sequence } } : item)),
      )
    }
  }, [])

  const handleError = useCallback((err) => {
    setError(err instanceof Error ? err.message : String(err))
  }, [])

  const handleProgress = useCallback((value) => setProgress(value), [])
  const handleStats = useCallback((value) => setStats(value), [])
  const handleZoomChange = useCallback((value) => setZoom(clamp(value, 0.1, 8)), [])
  const handleSeek = useCallback((value) => {
    seekTokenRef.current += 1
    setSeek({ value, token: seekTokenRef.current })
  }, [])
  const fitView = useCallback(() => {
    setZoom(1)
    setFitToken((token) => token + 1)
  }, [])
  const resetView = useCallback(() => {
    setZoom(1)
    setResetToken((token) => token + 1)
  }, [])
  const handleBackgroundChange = useCallback((mode, url) => {
    setBgMode(mode)
    setBackdropUrl(url)
  }, [])

  // ---- stage viewport ------------------------------------------------------
  // The WebGL canvas is sized from its own CSS box, so letterboxing the stage
  // frame is all it takes to preview the wallpaper's 1080p framing: both the
  // debug camera and the composition preview measure the frame, not the
  // workspace. The frame element is ALWAYS rendered (only its box changes), so
  // switching shape never remounts the stage / reloads the asset.
  // Default '16:9': the composition is judged against a real wallpaper screen
  // shape, so the letterboxed 1920×1080 box is the sensible starting point.
  // 'auto' (fills the workspace) stays available in the toolbar.
  const [stageRatio, setStageRatio] = useState('16:9')
  const stageAreaRef = useRef(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const node = stageAreaRef.current
    if (!node) return undefined
    const measure = () => setStageSize({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const stageFrame = useMemo(
    () => (stageRatio === '16:9' ? fitAspect(stageSize, STAGE_ASPECT) : null),
    [stageRatio, stageSize],
  )
  const stageFrameStyle = stageFrame
    ? {
        left: (stageSize.width - stageFrame.width) / 2,
        top: (stageSize.height - stageFrame.height) / 2,
        width: stageFrame.width,
        height: stageFrame.height,
      }
    : { left: 0, top: 0, width: '100%', height: '100%' }

  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      switch (event.code) {
        case 'Space':
          event.preventDefault()
          setPlaying((value) => !value)
          break
        case 'KeyF':
          fitView()
          break
        case 'KeyR':
          resetView()
          break
        case 'Equal':
        case 'NumpadAdd':
          setZoom((value) => clamp(value * 1.2, 0.1, 8))
          break
        case 'Minus':
        case 'NumpadSubtract':
          setZoom((value) => clamp(value / 1.2, 0.1, 8))
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitView, resetView])

  if (!models.length || !selected) return <EmptyLibrary />

  const stageStyle =
    bgMode === 'image' && backdropUrl
      ? { backgroundImage: `url("${backdropUrl}")` }
      : undefined
  const status = error ? 'error' : info ? 'ready' : 'loading'

  return (
    <div className="app-shell">
      <ModelSidebar
        models={models}
        warnings={warnings}
        selectedId={selected.id}
        onSelect={selectModel}
      />

      <main className="workspace">
        <header className="workspace-head">
          <div className="title-row">
            <div>
              <h1>Spine 模型查看器</h1>
              <p className="subtitle">
                {selected.character} / {selected.skin} · {selected.label}
                {info ? ` · Spine ${info.version}` : ''}
              </p>
            </div>
            <div className="head-actions">
              <a
                className="nav-link"
                href="./"
                onClick={(event) => {
                  event.preventDefault()
                  onGoWallpaper?.()
                }}
              >
                ← 壁纸首页
              </a>
              <span className={`status-pill status-${status}`}>
                {status === 'ready' ? '已就绪' : status === 'error' ? '出错' : '载入中'}
              </span>
            </div>
          </div>
          <Toolbar
            model={selected}
            playing={playing}
            loop={loop}
            speed={speed}
            zoom={zoom}
            bgMode={bgMode}
            backdropUrl={backdropUrl}
            onTogglePlay={() => setPlaying((value) => !value)}
            onLoopChange={setLoop}
            onSpeedChange={setSpeed}
            onZoomChange={handleZoomChange}
            onFit={fitView}
            onReset={resetView}
            onBackgroundChange={handleBackgroundChange}
            stageRatio={stageRatio}
            onStageRatioChange={setStageRatio}
          />
        </header>

        <div
          className={`stage-area${compose.on ? ' is-compose' : ` stage-bg-${bgMode}`}`}
          ref={stageAreaRef}
        >
          {/* The reference backdrop image belongs to the preview box, not to the
              workspace, so it stays aligned with the model when the 16:9 frame
              is letterboxed. The surrounding area keeps the flat colour. */}
          <div
            className={`stage-frame${stageFrame ? ' is-locked' : ''}`}
            style={compose.on ? stageFrameStyle : { ...stageFrameStyle, ...stageStyle }}
          >
            {/* Visible marker of the locked ratio (e.g. 16:9). Only while the
                frame is actually letterboxed; 'auto' has no shape to announce. */}
            {stageFrame && <span className="stage-frame-ratio">{stageRatio}</span>}
            {/* The wrapper is always present so toggling the preview never remounts
                the WebGL stage (and thus never reloads the asset). */}
            <CompositionStage
              enabled={compose.on}
              design={composeDesign}
              backdropUrl={compose.on && previewBackdrop ? assetUrl(previewBackdrop.url) : ''}
              transform={composeBackdropT}
              overscan={COMPOSE_OVERSCAN}
            >
              <SpineStage
                model={selected}
                animation={animation}
                animationStart={compose.animationStart}
                expression={expression}
                sequence={compose.on && entranceFraming ? previewSequence : null}
                sequenceToken={composeToken}
                onSequenceStage={handleStageClip}
                onSequenceDone={handleSequenceDone}
                skin={skin}
                playing={playing}
                speed={speed}
                loop={loop}
                zoom={compose.on ? 1 : zoom}
                showBones={showBones}
                showBounds={showBounds}
                infoReady={Boolean(info)}
                fitToken={fitToken}
                resetToken={resetToken}
                seek={seek}
                interactive={!compose.on}
                design={compose.on ? composeStageDesign : null}
                onZoomChange={handleZoomChange}
                onProgress={handleProgress}
                onStats={handleStats}
                onLoaded={handleLoaded}
                onError={handleError}
                onFit={fitView}
              />
            </CompositionStage>
          </div>
        </div>

        <Timeline progress={progress} onSeek={handleSeek} disabled={!info} />

        <footer className="statusbar">
          <span className="statusbar-left">
            <span className={`status-dot status-${status}`} />
            {selected.id}
            {animation && <span className="statusbar-anim"> · {animation}</span>}
          </span>
          <span className="statusbar-right">
            <span>{stats.fps} FPS</span>
            <span>{Math.round(zoom * 100)}%</span>
            <span className="statusbar-hint">空格 播放/暂停 · F 适应 · R 重置 · 滚轮缩放 · 拖拽平移 · 双击适应</span>
          </span>
        </footer>
      </main>

      <Inspector
        info={info}
        model={selected}
        tab={tab}
        onTabChange={setTab}
        animation={animation}
        onAnimationChange={setAnimation}
        expression={expression}
        onExpressionChange={setExpression}
        skin={skin}
        onSkinChange={setSkin}
        showBones={showBones}
        onShowBonesChange={setShowBones}
        showBounds={showBounds}
        onShowBoundsChange={setShowBounds}
        composition={{
          state: compose,
          design: composeDesign,
          backdrops: selected.backdrops,
          animations: info?.animations ?? [],
          playingSequence,
          // The copied config must target the model being TUNED, not whatever
          // modelId the file still holds — so it always follows the selection.
          fileConfig: fileConfig ? { ...fileConfig, modelId: selected?.id ?? fileConfig.modelId } : fileConfig,
          flash: composeFlash,
          // Display variants: which one the panel edits, plus the actions that
          // create / rename / delete them and pick the file's startup one.
          variants,
          editing,
          defaultVariant,
          // The base look, kept separate from `compose` (which holds the chip
          // being edited) — the copied JSON emits this for the top-level keys.
          baseView,
          onEditingChange: handleEditingChange,
          onVariantAdd: handleVariantAdd,
          onVariantRename: handleVariantRename,
          onVariantDefault: handleVariantDefault,
          onVariantRemove: handleVariantRemove,
          onPatch: updateCompose,
          onDetect: handleComposeDetect,
          onReplay: handleComposeReplay,
          onCopy: handleComposeCopy,
        }}
      />

      {error && (
        <div className="error-toast" role="alert">
          <strong>出错</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="关闭错误提示">
            ×
          </button>
        </div>
      )}
    </div>
  )
}
