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
//   1. this BUILT-IN object — `BUILTIN_WALLPAPER` below deep-merged with the
//      shipped JSON at module load, so a `file://` build (where fetch cannot
//      read local JSON) still opens with the factory defaults;
//   2. `wallpaper.config.json` (shipped next to index.html) — the FACTORY
//      DEFAULTS and the single source of truth: it is imported statically
//      above, so the built-in copy can never drift from it. Editing the file
//      next to a built dist/ still retunes the wallpaper without a rebuild
//      (the runtime fetch below wins over the baked-in values);
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

// Single source of truth for the factory defaults. Inlined into the bundle at
// build time, so `BUILTIN_WALLPAPER` (below) merged with it is always exactly
// what a fresh install shows.
import shippedConfig from '../../../public/wallpaper.config.json'

// Dependency-free lookups into the file:// build's inlined tables: the factory
// config object and "is this model actually shipped?". See lib/embed.js.
import { injectedConfig, isPackagedModel, packagedModel } from '../../lib/embed.js'

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

// Display variants (which loop / backdrop pair is on screen), shared with the
// debug viewer so both resolve the same one. See src/lib/variants.js.
export {
  VARIANT_KEYS,
  normalizeVariants,
  variantOverrides,
  findVariant,
  resolveVariantId,
  applyVariant,
  variantLabel,
} from '../../lib/variants.js'

const BUILTIN_WALLPAPER = {
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

  // Fixed design canvas in pixels. Default = 1920×1080, so a new wallpaper is
  // composed for a real screen shape regardless of the artwork's own resolution
  // (BD2 backdrops are often 1:1 squares). null = use the chosen backdrop's
  // NATIVE pixel size instead, which is the most faithful baseline and never
  // crops the image.
  design: { width: 1920, height: 1080 },

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
  // The shipped JSON overrides these at runtime (and is merged in at load
  // time above), so tuning belongs in public/wallpaper.config.json — the
  // values below are only the pre-merge base.
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

  // Seconds to skip at the head of the looping `animation`. Some BD2 idle
  // loops bake the character's slide-in into their first frames — set this to
  // just past that (e.g. 1.2) to start directly on the settled pose. The
  // entrance sequence clips are NOT trimmed; only the resting loop is.
  animationStart: 0,

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

  // Display variants: alternative "looks" for the SAME model, switchable from
  // the drawer. Each entry only carries the keys it OVERRIDES (usually
  // `animation` + `backdrop`, optionally `sequence` / `entrance` / transforms);
  // everything it omits falls back to the base values above. `variant` names the
  // one the wallpaper opens on; '' = the base composition.
  //
  //   "variant": "loop2",
  //   "variants": [
  //     { "id": "loop",  "label": "常服", "animation": "loop",
  //       "backdrop": "char021391 back1.png" },
  //     { "id": "loop2", "label": "礼装", "animation": "loop_2",
  //       "backdrop": "char021391 back2.png" }
  //   ]
  //
  // `modelId`, `design` and `fit` are deliberately NOT variant keys: the design
  // canvas is what every offset in this file is measured in, so letting a
  // variant change it would reinterpret all of them on a switch. Tune variants
  // in the debug viewer's 构图 tab. One variant (or none) is fine — the drawer
  // only shows the switch when there is something to switch between.
  variant: '',
  variants: [],

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
  //              GLOBAL: unlike the rest of `entrance`, a display variant may
  //              never override it (see GLOBAL_NESTED in lib/variants.js) — the
  //              switch belongs to the wallpaper, not to one look.
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
  //            Full-bleed layers (`ambient`, `pointer`, `spotlight`) have none.
  //
  // Audio spectrum and album card need the Wallpaper Engine bridge; in a plain
  // browser they simply stay empty (no fallback data is invented).
  overlay: {
    accent: '#a8c4ff',
    clock: {
      enabled: true,
      placement: 'minimal',
      // `#rrggbb` override for the text colour; empty = follow `overlay.accent`.
      color: '',
      anchor: 'bottom-left',
      // 0 = flush with the anchored edge. The clock is a text card with its own
      // padding, so a percentage inset just pushed it off the corner.
      offsetX: 0,
      offsetY: 0,
      size: 100,
      use24Hour: true,
      // Pointer-following tilt, and whether the card pumps with the bass.
      tilt: true,
      beat: true,
      // Beat response, forwarded to wallkit's `Clock`. `beatIntensity` is a
      // percent (100 = unchanged); `beatCurve` is the response exponent, and 1
      // (linear) is this project's default — wallkit's own default is 0.62.
      beatIntensity: 100,
      beatCurve: 1,
      labels: { locale: 'zh-CN', aria: '当前时间与日期' },
    },
    spectrum: {
      enabled: false,
      variant: 'bars',
      color: '',
      anchor: 'bottom-center',
      // Exact box, in CSS lengths: width is a share of the viewport width,
      // height of its height (`'100vw'` / `'14vh'` = a strip along the bottom
      // edge). Both axes together ARE the size of a spectrum — wallkit lets
      // them override its `size` scale, so the drawer edits these two and not
      // `size`. Radial styles (ring / ringwave / ripples) need a square, so they
      // use the same `vh` value on both axes (e.g. 46 / 46). `aurora` is a wide
      // curtain — its columns span the box width — so it stays linear (the
      // drawer's default for it is 100vw × 26vh).
      width: '100vw',
      height: '14vh',
      offsetX: 0,
      offsetY: 0,
      // Fallback scale, only read when width / height are left out entirely
      // (hand-written configs); the drawer does not expose it.
      size: 100,
      // Columns drawn. WallKit hands over 128 bars and folds nothing itself,
      // so a smaller number means chunkier bars (8 is the readable floor) and
      // 128 is "one column per band", i.e. no folding at all. The `dots` style
      // ignores it — it derives its own column count from the canvas width.
      barCount: 128,
      intensity: 100,
      curve: 1,
    },
    albumArt: {
      enabled: false,
      variant: 'classic',
      color: '',
      // `#rrggbb` override for the card text colour; empty = follow
      // `overlay.accent`. (`color` above recolours the card's inline spectrum,
      // not the text.)
      textColor: '',
      // Tri-state inline spectrum, mirroring wallkit's `spectrum` prop:
      // 'auto' leaves it to the layout (off for `vinyl`, on for the other ten,
      // because the record's ring bleeds 22% past the card), 'on' / 'off'
      // force it. Stored as a string so the drawer can round-trip it through
      // JSON; `undefined` (the library's own "follow the layout" value) cannot
      // survive a config file.
      spectrum: 'auto',
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
      // Percent pace for the whole particle layer (wallkit AMBIENT_SPEED_*).
      speed: 100,
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
    // Follows the pointer with one lit circle and dims everything around it.
    // Same input constraint as `pointer`: a WE desktop wallpaper delivers no
    // mouse events unless mouse interaction is enabled. Until the first event
    // arrives the mask stays fully transparent, so an event-less host shows the
    // bare wallpaper instead of a black screen.
    //
    // It is a full-bleed CSS layer, so it has NO anchor / offset: `size` is the
    // circle diameter in real screen pixels (not a percentage — this is the one
    // control whose size cannot follow the widget scale).
    spotlight: {
      enabled: false,
      size: 420,
      // Edge softness as a fraction of the radius: 0 = hard rim, 1 = the ramp
      // is as wide as the circle itself.
      feather: 0.45,
      // Opacity of the darkened area outside the circle (0..1).
      dim: 0.72,
      // Highlight inside the circle, blended with `screen` so it only lightens
      // what is already there (0..1). 0 drops the layer.
      glow: 0.22,
      darkColor: '#000000',
      lightColor: '#ffffff',
      // Follow lag as a time constant in seconds (0..0.5); 0 snaps to the
      // pointer, larger values give the light weight.
      smoothing: 0.05,
    },
    // REC-style viewfinder drawn around the whole picture (wallkit `Frame`).
    // A PICTURE-level decoration, not a widget: it takes no `anchor`, wraps
    // nothing and sits above every control (its own z-index 7, one above the
    // spotlight's 6). Nothing here moves the composition or the other widgets.
    //
    //   variant   — 'corners' (four brackets) | 'frame' (hairline + safe area) |
    //               'bracket' (top / bottom rails) | 'film' (side rails +
    //               perforations). The variant only decides the EDGE; the rest
    //               are orthogonal switches on purpose (no 4×5 matrix of HUDs).
    //   inset     — gutter between the picture edge and the line, in px
    //   thickness — hairline weight in px; 1.5 reads crisp at desktop DPR,
    //               1px tends to smear across two device pixels
    //   length    — corner bracket arm length in px (ignored by frame / film)
    //   size      — uniform multiplier for every length and the type size
    //   color     — '#rrggbb' override; empty = follow `theme`
    //   grid      — 'none' | 'thirds' | 'cross'
    //   ticks     — tick ruler under the bottom edge
    //   rec       — 'off' | 'dot' | 'rec'; only the string form draws the word
    //   timecode  — true = HH:MM:SS:00 counted from load (stops while paused).
    //               wallkit's Frame holds no timer on purpose, so the clock is
    //               ours: a frozen wallpaper must not show a running readout.
    //   labels    — true = draw the four preset corner readouts (AUTO / 4K ·
    //               60P / F/2.8 / ISO 400), false = plain brackets. The copy is
    //               a single constant (`FRAME_LABELS` in WallpaperOverlay.jsx)
    //               because Wallpaper Engine gives the wallpaper window no
    //               keyboard focus, so no text field can live in the drawer —
    //               a switch is all the UI can honestly offer. Fixed text on
    //               purpose: nothing is formatted or counted, so a paused
    //               wallpaper never shows stale data. Where `rec` / `timecode`
    //               already sit (tl / br) the readout steps down a line instead
    //               of overlapping them.
    //   theme     — 'light' = light line (for dark artwork), 'dark' = dark line
    frame: {
      enabled: false,
      variant: 'corners',
      inset: 28,
      thickness: 1.5,
      length: 56,
      size: 1,
      color: '',
      grid: 'none',
      ticks: false,
      rec: 'off',
      timecode: false,
      labels: false,
      theme: 'light',
    },
  },
}

// Shipped file wins over the handwritten base, field by field — this is what
// makes the JSON the single source of truth. `mergeConfig` (hoisted function
// declaration below) skips `_`-prefixed keys and preserves the base's key
// order, so the drawer's 「复制完整配置」 stays byte-identical to the file.
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const WALLPAPER = mergeConfig(BUILTIN_WALLPAPER, shippedConfig)

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

// The one-shot follow nudge's "already dismissed" flag (WallpaperPage). It is
// per-wallpaper too — every wallpaper greets its own first-time viewer — and
// lives here so clearWallpaperStorage() can drop both keys at once.
export const FOLLOW_DISMISS_KEY = 'wallpaper.followPrompt.dismissed'

function storage() {
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Storage owner tag + namespace
// ---------------------------------------------------------------------------
// Wallpaper Engine runs EVERY web wallpaper on the same `file://` origin, and
// `file://` has no per-directory origin: the whole scheme shares one
// localStorage bucket (measured in WE 2.8's own CEF profile). A bare key was
// therefore shared by all wallpapers built from this repo, so recording one
// preset silently overwrote the others — and a snapshot tuned for another
// character's model then beat this build's own `wallpaper.config.json`, leaving
// the right model in the wrong composition.
//
// Keys are therefore built as `<owner>:<base>:<modelId>`:
//
//   mikoberry:wallpaper.config.user:Ren_Yamashiro/Role_Reversal/cutscene_char021391
//   mikoberry:wallpaper.followPrompt.dismissed:Liatris/Sweet_Temptation/cutscene_char001297
//
// The owner tag is purely for humans: it makes every key this project writes
// instantly recognisable in a bucket shared with other people's wallpapers
// (DevTools → Application → Local Storage, or the on-disk leveldb). Nothing at
// runtime parses it, so it can be any fixed string — a handle, or a random id
// like '98ks023n99'. Changing it only orphans snapshots of already-shipped
// builds; it never breaks a running one.
const STORAGE_OWNER = 'mikoberry'

// The per-wallpaper suffix comes from the FACTORY config (the shipped JSON, or
// the config an embed build inlined), NOT from the snapshot we are about to
// read — reading a key to learn which key to read would be circular, and the
// `?model=` dev override must not fork storage either.
//
// Truly global preferences stay untagged on purpose: `wallpaper.locale`
// (lib/i18n.js) and `bd2.stats` (statsFlag.js).
export function storageNamespace() {
  return String(WALLPAPER.modelId || '').trim()
}

// `wallpaper.config.user` -> `mikoberry:wallpaper.config.user:<modelId>`
export function storageKey(base) {
  const parts = []
  if (STORAGE_OWNER) parts.push(STORAGE_OWNER)
  parts.push(base)
  const namespace = storageNamespace()
  if (namespace) parts.push(namespace)
  return parts.join(':')
}

// `{ at: ISO string, config: <complete config object> }`, or null.
function readSnapshot(store, key) {
  let raw
  try {
    raw = store.getItem(key)
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

export function readRecordedConfig() {
  const store = storage()
  if (!store) return null

  const own = readSnapshot(store, storageKey(RECORD_KEY))
  if (own) return own

  // One-time adoption of an older slot. Both are unowned leftovers:
  //   `wallpaper.config.user`            — pre-namespace, shared by every build;
  //   `wallpaper.config.user:<modelId>`  — the namespaced-but-untagged form.
  // The global one holds whichever wallpaper was recorded LAST, which may be a
  // different build entirely, so only take a snapshot when it was tuned for THIS
  // build's model. The copy lands in the current key and the old one is left in
  // place — another wallpaper built from the same model may still read it.
  const namespace = storageNamespace()
  if (!namespace) return null
  for (const legacyKey of [RECORD_KEY, `${RECORD_KEY}:${namespace}`]) {
    const legacy = readSnapshot(store, legacyKey)
    if (!legacy) continue
    if (String(legacy.config.modelId || '').trim() !== namespace) continue
    try {
      store.setItem(storageKey(RECORD_KEY), JSON.stringify(legacy))
    } catch {
      // Storage full / read-only: the in-memory value still applies this session.
    }
    console.info('[wallpaper] 已把旧的配置快照迁移到本壁纸的键：', storageKey(RECORD_KEY))
    return legacy
  }
  return null
}

export function saveRecordedConfig(config, at = new Date().toISOString()) {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(storageKey(RECORD_KEY), JSON.stringify({ at, config }))
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
    store.removeItem(storageKey(RECORD_KEY))
    return true
  } catch {
    return false
  }
}

// Drawer's test-only "clear storage" button: drop THIS wallpaper's keys only.
// Locale and the performance HUD are preferences shared by every wallpaper, so
// they survive — the previous implementation called localStorage.clear(), which
// (because the origin is shared) also reset the other wallpapers' snapshots.
export function clearWallpaperStorage() {
  const store = storage()
  if (!store) return false
  let ok = true
  for (const base of [RECORD_KEY, FOLLOW_DISMISS_KEY]) {
    try {
      store.removeItem(storageKey(base))
    } catch {
      ok = false
    }
  }
  return ok
}

// Reads the shipped JSON file. Never rejects: a missing / unreadable file (e.g.
// `file://`, plain static hosting without the JSON) just falls back to the
// built-in defaults, so the wallpaper always renders.
async function readConfigFile({ timeout = 5000 } = {}) {
  // `BD2_EMBED=1` builds inline this very file as `assets/embed-config.js`,
  // because a file:// host blocks fetch(). It occupies the same priority slot
  // as the real file (still below the user's recorded snapshot), so retuning
  // now means editing public/wallpaper.config.json and rebuilding.
  const injected = injectedConfig()
  if (injected) {
    return {
      config: mergeConfig(WALLPAPER, injected),
      source: 'file',
      url: `embedded:${CONFIG_FILE}`,
    }
  }

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
  const picked =
    models.find((item) => item.id === id) ??
    models.find((item) => item.id.includes(id)) ??
    models[0]
  // An embed build ships ONLY the model named by public/wallpaper.config.json
  // (`MODEL_ONLY`). A localStorage snapshot left over from tuning another
  // character would pick a model whose files are not inlined: every lookup
  // misses, the loader falls back to blocked file:// requests and the page
  // hangs until the 60s timeout — a black wallpaper with no useful error.
  // Fall back to the model this build actually carries, loudly.
  if (picked && !isPackagedModel(picked)) {
    const fallback = packagedModel(models)
    if (fallback) {
      console.warn(
        `[wallpaper] ${picked.id} 未随本次构建打包，改用 ${fallback.id}。` +
          '要换人物请改 public/wallpaper.config.json 后重新 build:we:embed，' +
          '或在抽屉里「恢复首次默认」清掉旧快照',
      )
      return fallback
    }
  }
  return picked
}

// Composition geometry lives in src/lib/composition.js (re-exported at the top):
// resolveDesign / designScale / resolveLayerTransform / resolveEntrance /
// parallaxOffset / compositionRects / normalizeRect.

