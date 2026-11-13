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
// These are the BUILT-IN DEFAULTS. The live values come from
// `wallpaper.config.json` (shipped next to index.html), deep-merged on top of
// this object at startup — see loadWallpaperConfig(). Keep this object usable
// on its own: it is the fallback when the file is missing or unreadable
// (e.g. a `file://` build, where fetch cannot read local JSON).

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
      // Full-bleed strip: width from the viewport, fixed thickness.
      width: '100vw',
      height: '14vh',
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
// External config file
// ---------------------------------------------------------------------------
// `public/wallpaper.config.json` is copied verbatim to `dist/`, so a built
// wallpaper can be retuned by editing ONE file next to index.html — no rebuild.
// Every key it omits keeps the built-in default above; `_`-prefixed keys are
// treated as comments and may be added freely.
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

// Never rejects: a missing / unreadable file (e.g. `file://`, plain static
// hosting without the JSON) just falls back to the built-in defaults, so the
// wallpaper always renders.
export async function loadWallpaperConfig({ timeout = 5000 } = {}) {
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

export function resolveWallpaperModel(models, overrideId = '', modelId = WALLPAPER.modelId) {
  if (!models?.length) return null
  const id = overrideId || modelId
  return models.find((item) => item.id === id) ?? models.find((item) => item.id.includes(id)) ?? models[0]
}

export function pickBackdrop(model, preference = WALLPAPER.backdrop) {
  const all = model?.backdrops ?? []
  if (!all.length || preference === 'none' || preference === '') return null

  if (typeof preference === 'string' && preference !== 'auto') {
    const needle = preference.toLowerCase()
    const hit = all.find(
      (item) =>
        item.file.toLowerCase() === needle ||
        item.url.toLowerCase() === needle ||
        item.file.toLowerCase().includes(needle),
    )
    if (hit) return hit
  }

  // Clean full scenes only; prefer the highest native resolution, then a
  // stable filename order so the choice never depends on filesystem order.
  return (
    [...all.filter((item) => item.usable !== false)].sort(
      (a, b) =>
        (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0) ||
        a.file.localeCompare(b.file),
    )[0] ?? null
  )
}

export function resolveDesign(backdrop, override = WALLPAPER.design) {
  if (override?.width > 0 && override?.height > 0) {
    return { width: override.width, height: override.height }
  }
  if (backdrop?.width > 0 && backdrop?.height > 0) {
    return { width: backdrop.width, height: backdrop.height }
  }
  // Fallback when no backdrop is available (or its size could not be read).
  return { width: 2048, height: 2048 }
}

// Pure helper, also used by offline composition checks.
export function designScale(design, viewport, fit = WALLPAPER.fit) {
  const sx = viewport.width / design.width
  const sy = viewport.height / design.height
  return fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy)
}

const FALLBACK_DESIGN = { width: 2048, height: 2048 }

// Number = design pixels. '10%' = 10% of the design canvas width/height.
// A numeric string is also accepted as plain design pixels.
function designLength(value, basis) {
  if (typeof value === 'string') {
    const percent = /^\s*(-?(?:\d+\.?\d*|\.\d+))%\s*$/.exec(value)
    if (percent) return (Number(percent[1]) / 100) * basis
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return Number.isFinite(value) ? value : 0
}

// Resolve one layer's adjustment to a single design-space tuple. Both the
// backdrop's CSS transform and the model's camera use THIS result, so their
// semantics can never diverge.
export function resolveLayerTransform(spec = {}, design = FALLBACK_DESIGN) {
  const s = spec ?? {}
  const scale = Number.isFinite(s.scale) && s.scale > 0 ? s.scale : 1
  return {
    scale,
    dx: designLength(s.offsetX ?? 0, design.width),
    dy: designLength(s.offsetY ?? 0, design.height),
  }
}

// Normalise the parallax block. Unknown / missing numbers fall back to 0 so a
// half-written config file cannot make a layer jump.
export function resolveParallax(spec = WALLPAPER.parallax) {
  const s = spec ?? {}
  return {
    enabled: s.enabled !== false,
    backdrop: Number.isFinite(s.backdrop) ? s.backdrop : 0,
    model: Number.isFinite(s.model) ? s.model : 0,
  }
}

const clampUnit = (value) => Math.min(1, Math.max(-1, Number.isFinite(value) ? value : 0))

// Parallax offset for ONE layer, in design pixels. `strength` is a percentage
// of the design canvas, `pointer` is the normalised cursor position in -1..1
// on both axes (x: left..right, y: top..bottom). Positive strength = the layer
// moves in the same direction as the pointer, negative = the opposite way.
// Pure, so the direction / magnitude can be checked in plain Node.
export function parallaxOffset(strength, design = FALLBACK_DESIGN, pointer = {}) {
  const pct = (Number.isFinite(strength) ? strength : 0) / 100
  return {
    x: pct * design.width * clampUnit(pointer.x),
    y: pct * design.height * clampUnit(pointer.y),
  }
}

// Apply a layer transform to a rect given in design pixels. The translation is
// intentionally NOT scaled: CSS `translate(dx,dy) scale(s)` behaves the same.
export function layerRect(rect, transform) {
  const { scale, dx, dy } = transform
  return {
    cx: rect.cx + dx,
    cy: rect.cy + dy,
    w: rect.w * scale,
    h: rect.h * scale,
  }
}

// The model's rect BEFORE its layer transform, in design pixels. Mirrors the
// camera maths in SpineStage's fixed-design branch (same max() constraint).
export function modelBaseRect(design, model = WALLPAPER.model, setupBounds, zoom = WALLPAPER.zoom) {
  const m = model ?? WALLPAPER.model
  const hRatio = m.heightRatio > 0 ? m.heightRatio : 1
  const wRatio = m.widthRatio > 0 ? m.widthRatio : 1
  const alignX = Number.isFinite(m.alignX) ? m.alignX : 0.5
  const alignY = Number.isFinite(m.alignY) ? m.alignY : 0.5
  const bw = setupBounds?.width > 0 ? setupBounds.width : design.width
  const bh = setupBounds?.height > 0 ? setupBounds.height : design.height
  const z = Math.max(bh / (design.height * hRatio), bw / (design.width * wRatio))
  const unitsPerDesignPx = z / Math.max(zoom, 0.001)
  return {
    cx: alignX * design.width,
    cy: alignY * design.height,
    w: bw / unitsPerDesignPx,
    h: bh / unitsPerDesignPx,
  }
}

// Both layers' final rects in design pixels — the single source of truth for
// offline invariance checks. Nothing here depends on a viewport.
export function compositionRects(design, backdropSpec, modelSpec, setupBounds, zoom = WALLPAPER.zoom) {
  const base = { cx: design.width / 2, cy: design.height / 2, w: design.width, h: design.height }
  return {
    backdrop: layerRect(base, resolveLayerTransform(backdropSpec, design)),
    model: layerRect(
      modelBaseRect(design, WALLPAPER.model, setupBounds, zoom),
      resolveLayerTransform(modelSpec, design),
    ),
  }
}

export function normalizeRect(rect, design) {
  return [rect.cx / design.width, rect.cy / design.height, rect.w / design.width, rect.h / design.height]
}
