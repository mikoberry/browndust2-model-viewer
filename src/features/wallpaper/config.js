// Configuration for the root route ('/'): a full-screen wallpaper showing ONE
// fixed model over its matching backdrop, with a fixed, resolution-independent
// composition. The debug viewer at /spine-viewer reads none of this.
//
// Composition model: a fixed "design canvas" holds BOTH the backdrop image and
// the Spine model. That one canvas is then uniformly scaled and centred on the
// real screen. Because both layers share the same transform, changing the
// screen size or aspect ratio can never change their relative size/position.
// Each layer may additionally be scaled / offset independently, but ONLY in
// design coordinates (design pixels or % of the design canvas) — see
// resolveLayerTransform() below. Screen-pixel units would break invariance.
//
// Configuration has three layers, in increasing priority:
//
//   1. this BUILT-IN object — fallback when even the JSON file is unreadable
//      (e.g. a `file://` build, where fetch cannot read local JSON);
//   2. `wallpaper.config.json` (shipped next to index.html) — the FACTORY
//      DEFAULTS: what a fresh install / first open shows;
//   3. the user's own snapshot, saved by the drawer's 「记录配置」 into
//      localStorage — once it exists it WINS over the file, so a wallpaper that
//      was tuned by hand keeps that tune across reloads and across switching to
//      another wallpaper and back. It is dropped only by 「恢复默认」 (or by the
//      host throwing the wallpaper's storage away, which is what uninstalling
//      and reinstalling it does).
//
// See loadWallpaperConfig() for the exact merge order.
//
// The geometry helpers re-exported here live in src/lib/composition.js, because
// the debug viewer's composition preview uses the exact same maths. Keeping one
// import path for the wallpaper keeps the two call sites honest.

export {
  FALLBACK_DESIGN,
  designLength,
  resolveLayerTransform,
  resolveEntrance,
  clipFraming,
  NEUTRAL_LAYER,
  blendLayerTransform,
  resolveDesign,
  designScale,
  resolveParallax,
  parallaxOffset,
  layerRect,
  modelBaseRect,
  compositionRects,
  normalizeRect,
} from '../../lib/composition.js'

export const WALLPAPER = {
  // Exact model id (see `npm run model:list`). Exact match -> partial match ->
  // first model, so changing the library never blanks the page.
  // Dev only: /?model=<id> overrides this without a rebuild.
  modelId: 'Wilhelmina/Iron_Monarch/cutscene_char067601',
  // Which backdrop to use:
  //   'auto'         -> the highest-resolution *usable* backdrop linked to this model
  //   'none' / ''    -> no backdrop
  //   filename part  -> e.g. 'back2' or 'char067601_back1.png'
  // The link comes from the 6-digit character id, so switching modelId above
  // automatically switches to that character's own wallpaper.
  backdrop: 'auto',

  // Fixed design canvas in pixels. null = use the chosen backdrop's NATIVE
  // pixel size (the scanner records it), which is the most faithful baseline.
  // Set e.g. { width: 2048, height: 2048 } to force one baseline for all models.
  design: null,

  // How the design canvas maps to the screen. Both layers use the SAME scale.
  //   'contain' -> whole composition always visible, letterbox on other ratios
  //   'cover'   -> fills the screen, crops the overflow symmetrically
  // Either way the backdrop/model relative geometry is identical.
  fit: 'contain',
  letterbox: '#101319',
  // Fill the letterbox with a blurred, enlarged copy of the same backdrop.
  bleed: true,

  // Render surface, relative to the design canvas. Both layers are drawn on a
  // surface `overscan` times larger and centred on the canvas, then the visible
  // overflow is clipped by the viewport instead of the canvas bounds. Without
  // it, panning / enlarging either layer produced a hard straight edge exactly
  // at the canvas rectangle. 1 = old behaviour (exact canvas, hard clip).
  // Layout is unaffected at scale 1: the camera still maps design -> device
  // pixels with k = renderScale, so the composition maths is unchanged.
  overscan: 1.5,

  // Model placement INSIDE the design canvas, as ratios (0..1). These never
  // depend on the screen: heightRatio is relative to design.height, alignX/Y
  // is the model centre's position within the canvas.
  model: {
    heightRatio: 1, // model setup-bounds height / design.height
    widthRatio: 1, // upper bound: model width / design.width
    alignX: 0.5, // 0 = left edge, 1 = right edge
    alignY: 0.5, // 0 = top edge, 1 = bottom edge
  },

  // Independent per-layer adjustments, ALWAYS expressed in design-canvas
  // coordinates (never screen pixels). Both layers use the exact same
  // semantics: scale around the layer centre, then translate by a fixed
  // design-space offset (the translation is NOT multiplied by the scale).
  //
  //   scale:   1 = as composed, 2 = twice as large
  //   offsetX: number = design pixels (e.g. 100), or '10%' = 10% of design.width
  //   offsetY: number = design pixels (e.g. 100), or '10%' = 10% of design.height
  //
  // Because these numbers live inside the fixed design canvas, the whole
  // composition is just scaled by one factor on the real screen: the result is
  // identical on every resolution / aspect ratio / DPR / fit mode.
  // Keep these in sync with public/wallpaper.config.json: that file overrides
  // them at runtime, but `file://` cannot fetch it, so this copy must already
  // hold the intended defaults.
  backdropTransform: {
    scale: 1.7,
    offsetX: 0,
    offsetY: 0,
  },
  modelTransform: {
    scale: 1.7,
    offsetX: 0,
    offsetY: 0,
  },

  // Mouse parallax: while the pointer moves, the chosen layers drift with it.
  // Same direction as the pointer (pointer at the top-left -> content moves up
  // and left), so a POSITIVE strength feels "the artwork is following the
  // cursor"; a NEGATIVE strength moves it the opposite way.
  //
  //   enabled  — master switch; false freezes both layers at their composition
  //   backdrop — strength for the background, in % of the design canvas
  //   model    — strength for the Spine model, in % of the design canvas
  //
  // 0 = that layer stays still. Values are relative to the design canvas, not
  // to the screen, so the drift is identical on every resolution / DPR. The
  // pointer is normalised to the viewport (-1..1 both axes) and eased, so the
  // layers return to the composed position when the cursor is centred.
  parallax: {
    enabled: true,
    backdrop: 0,
    model: 2,
  },

  // null = auto-pick (loop_2 / first _faceN). A string pins an animation,
  // an empty string disables that track entirely.
  animation: null,
  expression: null,

  // Entrance sequence on track 0: names played back to back once, and the LAST
  // one then loops. BD2 boss/character cutscenes ship a `cut_A` / `cut_B` pair
  // (some models spell it `A_cut` / `B_cut`, a few add `C_cut`) that lead into
  // the idle loop, so the game plays cut_A -> cut_B -> loop_2 when the scene
  // opens. Names vary per model, so this is a plain list: edit it (or set it to
  // null / []) when you switch `modelId`. Unknown names are ignored, and it runs
  // once per load; the composition tab has a "replay" button to start it again.
  // The literal string 'auto' derives the list from the model's own animation
  // names (cut_A/cut_B/…, then loop_2) — handy when you keep switching models.
  sequence: ['cut_A', 'cut_B', 'loop_2'],

  // Click-to-play: while `enabled`, clicking the model plays `name` ONCE (a
  // one-shot reaction like a poke / cut_B jab) and then hands track 0 back to
  // `animation` (the idle loop). `name` must be one of the model's animations,
  // e.g. 'cut_B'; an unknown name is ignored. This only matters when the host
  // delivers mouse events (Wallpaper Engine: enable "mouse interaction"), so it
  // is off by default.
  clickAnimation: {
    enabled: false,
    name: 'cut_B',
  },

  // Framing used WHILE each clip of the sequence above plays. Every clip keeps
  // its OWN backdrop / scale / offset, because a game cutscene is a chain of
  // separate shots: cut_A may be a wide establishing frame, cut_B a close-up on
  // a different backdrop, and loop_2 the settled idle view. They are joined at
  // playback time, so nothing has to be baked into the artwork.
  //
  //   autoplay — true = play the sequence once the model has loaded (the
  //              wallpaper "opens" with its cutscene). false = start directly on
  //              the resting composition; a round play button above the
  //              settings button then starts it on demand.
  //   blend    — seconds of cross-fade between two clips (0 = hard cut)
  //   clips    — keyed by ANIMATION NAME; each entry may set
  //                backdrop          image pick ('auto' / 'none' / filename part),
  //                                  '' = keep the global `backdrop` above
  //                backdropTransform { scale, offsetX, offsetY }
  //                modelTransform    { scale, offsetX, offsetY }
  //              Offsets are design pixels (or '10%'), exactly like the two
  //              blocks above; a clip with no entry plays on the raw canvas.
  //
  // The LAST clip is special: if it has an entry here, its framing stays on
  // screen for the rest of the session (it IS the wallpaper). If it has none,
  // the layers ease back to `backdropTransform` / `modelTransform` when it
  // starts. Names vary per model — tune this in the debug viewer's 构图 tab,
  // which reads and writes the same file.
  entrance: {
    autoplay: true,
    blend: 0.9,
    clips: {},
  },

  skin: '',
  speed: 1,
  // Extra multiplier on top of the fixed composition (>1 enlarges).
  zoom: 1,

  // Floating control overlays (WallKit). These are NOT part of the fixed
  // composition: they are anchored to the viewport, so scaling the design
  // canvas never moves them. Every widget is opt-in — with all of them
  // disabled the page is a bare wallpaper again.
  //
  //   accent — shared accent colour (#rrggbb), used by spectrum bars, particles
  //            and pointer effects; omit it to keep the library default.
  //   theme  — WallKit convention: 'light' = light text (dark artwork),
  //            'dark' = dark text (light artwork).
  //   anchor — 9 anchors (four corners + edge centres + centre); offsetX /
  //            offsetY are measured INWARD from that anchor. A number is a
  //            percentage of the viewport, a string is any CSS length.
  //
  // Audio spectrum and album card need the Wallpaper Engine bridge; in a plain
  // browser they simply stay empty (no fallback data is invented).
  overlay: {
    accent: '#a8c4ff',
    clock: {
      enabled: true,
      placement: 'minimal',
      theme: 'light',
      anchor: 'bottom-left',
      offsetX: 4,
      offsetY: 4,
      size: 100,
      use24Hour: true,
      // Pointer-following tilt, and whether the card pumps with the bass.
      tilt: true,
      beat: true,
      labels: { locale: 'zh-CN', aria: '当前时间与日期' },
    },
    spectrum: {
      enabled: false,
      variant: 'bars',
      color: '',
      anchor: 'bottom-center',
      // Size is the default control (`size` drives the box scale). Set an exact
      // `width` / `height` (e.g. '100vw' / '14vh' for a full-bleed strip) to
      // override `size`; radial styles (ring/ringwave/ripples/aurora) always
      // ignore them and use `size` to stay square.
      width: '',
      height: '',
      offsetX: 0,
      offsetY: 0,
      size: 100,
      intensity: 100,
      curve: 1,
    },
    albumArt: {
      enabled: false,
      variant: 'classic',
      theme: 'light',
      color: '',
      anchor: 'top-left',
      offsetX: 4,
      offsetY: 4,
      size: 100,
      labels: { aria: '正在播放' },
    },
    ambient: {
      enabled: false,
      variant: 'snow',
      color: '',
      density: 100,
      size: 100,
      intensity: 100,
    },
    pointer: {
      enabled: false,
      trail: true,
      click: true,
      trailVariant: 'glow',
      clickVariant: 'ripple',
      color: '',
      size: 100,
      intensity: 100,
    },
  },
}

// ---------------------------------------------------------------------------
// External config file (factory defaults)
// ---------------------------------------------------------------------------
// `public/wallpaper.config.json` is copied verbatim to `dist/`, so a built
// wallpaper can be retuned by editing ONE file next to index.html — no rebuild.
// Every key it omits keeps the built-in default above; `_`-prefixed keys are
// treated as comments and may be added freely.
//
// Think of it as the FIRST-RUN default: the moment the user hits 「记录配置」 in
// the drawer, their snapshot (below) takes over and this file is only read
// again after 「恢复默认」.
export const CONFIG_FILE = 'wallpaper.config.json'

// Kept identical to the `_readme` in public/wallpaper.config.json; the drawer
// re-emits it so a copied file can be pasted back verbatim.
export const CONFIG_README =
  '壁纸配置。改完刷新页面即生效，无需重新构建；打包后这个文件就在 index.html 旁边。省略任何字段都会沿用代码里的内置默认值，以 _ 开头的键只当注释。偏移量单位是设计画布像素，也可以写 \'10%\'（相对设计画布宽 / 高）。'

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// Deep-merge `override` onto `base`. Only plain objects recurse; numbers,
// strings, booleans, arrays and null replace wholesale. Unknown keys survive,
// so the file can introduce new settings before the code is taught about them.
export function mergeConfig(base, override) {
  if (!isPlainObject(override)) return { ...base }
  const merged = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (key.startsWith('_') || value === undefined) continue
    merged[key] = isPlainObject(value) && isPlainObject(merged[key])
      ? mergeConfig(merged[key], value)
      : value
  }
  return merged
}

// Resolved against the document URL, which is exactly where the file sits (both
// in dev — `public/` — and in dist, since Vite copies public/ verbatim).
export function configFileUrl() {
  return new URL(CONFIG_FILE, document.baseURI).href
}

// ---------------------------------------------------------------------------
// User snapshot (localStorage)
// ---------------------------------------------------------------------------
// Wallpaper Engine runs a web wallpaper on a file:// / localhost origin where
// storage can be unavailable, so every access is guarded and a failure only
// means "the tune will not survive a reload".
//
// Deliberately a NEW key: the old `wallpaper.config.record` slot held a
// `{ at, text }` snapshot that was never read back, so its contents are stale
// (they still carry whatever the file said the day it was recorded). It stays
// in storage as inert junk and gets replaced by the first new 「记录配置」.
const RECORD_KEY = 'wallpaper.config.user'

function storage() {
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

// `{ at: ISO string, config: <complete config object> }`.
export function readRecordedConfig() {
  const store = storage()
  if (!store) return null
  let raw
  try {
    raw = store.getItem(RECORD_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!isPlainObject(parsed?.config)) return null
    return { at: typeof parsed?.at === 'string' ? parsed.at : '', config: parsed.config }
  } catch {
    return null
  }
}

export function saveRecordedConfig(config, at = new Date().toISOString()) {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(RECORD_KEY, JSON.stringify({ at, config }))
    return true
  } catch {
    return false
  }
}

// 「恢复默认」: forget the snapshot so the shipped file applies again.
export function clearRecordedConfig() {
  const store = storage()
  if (!store) return false
  try {
    store.removeItem(RECORD_KEY)
    return true
  } catch {
    return false
  }
}

// Reads the shipped JSON file. Never rejects: a missing / unreadable file (e.g.
// `file://`, plain static hosting without the JSON) just falls back to the
// built-in defaults, so the wallpaper always renders.
async function readConfigFile({ timeout = 5000 } = {}) {
  const url = configFileUrl()
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : 0
  try {
    const response = await fetch(url, { signal: controller?.signal, cache: 'no-cache' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const raw = await response.json()
    return { config: mergeConfig(WALLPAPER, raw), source: 'file', url }
  } catch (error) {
    console.warn('[wallpaper] 配置文件不可用，改用内置默认值：', url, error)
    return { config: { ...WALLPAPER }, source: 'builtin', url }
  } finally {
    clearTimeout(timer)
  }
}

// Priority: built-in < shipped file < the user's own recorded snapshot.
// `source` tells the drawer where the live values came from:
//   'user'    — a recorded snapshot is in charge (the file is inert)
//   'file'    — first run, no snapshot yet: the shipped file is the default
//   'builtin' — the file could not be read either
// The snapshot is merged ON TOP of the file (not used verbatim) so a newer
// build that adds keys still gets sane values for them.
export async function loadWallpaperConfig(options) {
  const base = await readConfigFile(options)
  const recorded = readRecordedConfig()
  if (!recorded) return base
  return {
    ...base,
    config: mergeConfig(base.config, recorded.config),
    source: 'user',
    recordedAt: recorded.at,
  }
}

export { pickBackdrop } from '../../lib/backdrops.js'

export function resolveWallpaperModel(models, overrideId = '', modelId = WALLPAPER.modelId) {
  if (!models?.length) return null
  const id = overrideId || modelId
  return models.find((item) => item.id === id) ?? models.find((item) => item.id.includes(id)) ?? models[0]
}

// Composition geometry lives in src/lib/composition.js (re-exported at the top):
// resolveDesign / designScale / resolveLayerTransform / resolveEntrance /
// parallaxOffset / compositionRects / normalizeRect.

