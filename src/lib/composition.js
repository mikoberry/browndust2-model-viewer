// Pure composition maths for the fixed "design canvas" model.
//
// One virtual canvas holds BOTH picture layers (backdrop image + Spine model),
// then the canvas as a whole is uniformly scaled / centred on the real screen.
// Because both layers live in the same canvas, changing the screen size, aspect
// ratio, DPR or fit mode can NEVER change their relative size or position.
//
// Everything here is unit-free of the screen (numbers are design pixels or pure
// ratios) and has no React / DOM dependency, so the invariants can be checked in
// plain Node. Two consumers: the wallpaper route (features/wallpaper) and the
// debug viewer's composition preview (features/viewer).

export const FALLBACK_DESIGN = { width: 2048, height: 2048 }

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// Number = design pixels. '10%' = 10% of the design canvas width/height.
// A numeric string is also accepted as plain design pixels.
export function designLength(value, basis) {
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
// semantics can never diverge:
//
//   scale around the layer centre, then translate by a fixed design-pixel
//   offset that is NOT multiplied by the scale.
export function resolveLayerTransform(spec = {}, design = FALLBACK_DESIGN) {
  const s = spec ?? {}
  const scale = Number.isFinite(s.scale) && s.scale > 0 ? s.scale : 1
  return {
    scale,
    dx: designLength(s.offsetX ?? 0, design.width),
    dy: designLength(s.offsetY ?? 0, design.height),
  }
}

// A layer that has not been touched: 1×, no offset. This is what a clip looks
// like when it has no entry of its own — a BD2 cutscene is authored for its own
// camera, so the wallpaper's zoom / offsets must NOT crop it.
export const NEUTRAL_LAYER = Object.freeze({ scale: 1, dx: 0, dy: 0 })

// Framing of an entrance sequence, ONE ENTRY PER CLIP.
//
// A BD2 scene is a chain of separate shots (cut_A -> cut_B -> loop_2) and each
// shot has its own camera, background and even backdrop image. So the framing is
// keyed by ANIMATION NAME — that is the only stable identity, the clips come
// from the skeleton rather than from a fixed slot index:
//
//   entrance: {
//     autoplay: true,                              // play on load, or not
//     blend: 0.9,                                  // cross-fade, seconds
//     clips: {
//       cut_A:  { backdrop, backdropTransform, modelTransform, camera },
//       cut_B:  { … },
//       loop_2: { … },
//     },
//   }
//
// A clip that is not listed plays on the raw design canvas. `backdrop: ''`
// means "keep the global `backdrop` pick".
//
// `camera` is the shot's CAMERA MOVE (PV-style pan / zoom over the WHOLE
// picture, both layers together): `from` / `to` poses in design-canvas units
// (`zoom` scalar, `x` / `y` design pixels or '10%' strings), `duration` in
// seconds (0 = the clip's own length), `ease` one of the keys below. Motion
// plays ONLY when both `from` and `to` are given — a half-written camera is a
// still frame, never a partial move. While the clip runs the pose loops over
// `duration` until the clip ends.
export const CAMERA_EASES = ['linear', 'easeIn', 'easeOut', 'easeInOut']

const CAMERA_EASE_FNS = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) * (-2 * t + 2) / 2),
}

// One camera pose -> design-px numbers. `x` / `y` are pan offsets relative to
// the composed frame's centre (so the default 0/0 keeps the frame put).
function resolveCameraPose(pose, design) {
  const p = pose && typeof pose === 'object' ? pose : {}
  const zoom = Number.isFinite(p.zoom) && p.zoom > 0 ? p.zoom : 1
  return {
    zoom,
    x: designLength(p.x, design.width),
    y: designLength(p.y, design.height),
  }
}

// Resolved camera for one clip, or null when there is no motion (missing,
// incomplete, or identity poses are still kept — the interpolator decides).
export function resolveCamera(spec, design = FALLBACK_DESIGN) {
  const s = spec && typeof spec === 'object' ? spec : {}
  const hasFrom = s.from && typeof s.from === 'object'
  const hasTo = s.to && typeof s.to === 'object'
  if (!hasFrom || !hasTo) return null
  return {
    from: resolveCameraPose(s.from, design),
    to: resolveCameraPose(s.to, design),
    // 0 = ride the clip's own duration (resolved by the player).
    duration: Number.isFinite(s.duration) && s.duration > 0 ? s.duration : 0,
    ease: CAMERA_EASES.includes(s.ease) ? s.ease : 'linear',
  }
}

// Pose at `elapsed` seconds into the clip. Runs once over `duration` (or the
// clip's own length when the camera carries no duration of its own) and holds
// the destination pose past the end — a camera move is a single shot, not a
// loop. Returns null when there is nothing to move — callers treat that as
// "keep the frame still".
export function cameraAt(camera, elapsed, fallbackDuration = 0) {
  if (!camera) return null
  const duration = camera.duration > 0 ? camera.duration : fallbackDuration
  if (!(duration > 0)) return null
  const ease = CAMERA_EASE_FNS[camera.ease] ?? CAMERA_EASE_FNS.linear
  const t = ease(Math.min(Number(elapsed) / duration, 1))
  const { from, to } = camera
  return {
    zoom: from.zoom + (to.zoom - from.zoom) * t,
    dx: from.x + (to.x - from.x) * t,
    dy: from.y + (to.y - from.y) * t,
  }
}

export function resolveEntrance(spec = {}, design = FALLBACK_DESIGN) {
  const s = spec ?? {}
  const clips = {}
  const raw = s.clips && typeof s.clips === 'object' ? s.clips : {}
  for (const [name, clip] of Object.entries(raw)) {
    if (!name) continue
    clips[name] = {
      backdrop: typeof clip?.backdrop === 'string' ? clip.backdrop : '',
      backdropTransform: resolveLayerTransform(clip?.backdropTransform, design),
      modelTransform: resolveLayerTransform(clip?.modelTransform, design),
      camera: resolveCamera(clip?.camera, design),
    }
  }
  return {
    // Whether the sequence runs by itself once the model is loaded. false means
    // the wallpaper opens straight into its resting composition — the playlist
    // still exists, it just waits for the playback button.
    autoplay: s.autoplay !== false,
    blend: Number.isFinite(s.blend) && s.blend >= 0 ? s.blend : 0,
    clips,
  }
}

// Fully resolved framing for one clip — never null, so callers can index it
// without a fallback. `backdrop: ''` means "keep the global pick". A clip that
// was never configured resolves to NEUTRAL_LAYER (raw design canvas) and no
// camera move.
export function clipFraming(entrance, name) {
  const clip = name ? entrance?.clips?.[name] : null
  return {
    backdrop: clip?.backdrop ?? '',
    backdropTransform: clip?.backdropTransform ?? NEUTRAL_LAYER,
    modelTransform: clip?.modelTransform ?? NEUTRAL_LAYER,
    camera: clip?.camera ?? null,
  }
}

// Linear blend of two resolved layer transforms; `t` is clamped to 0..1 and is
// already eased by the caller. Used for the entrance -> composed transition.
export function blendLayerTransform(a, b, t) {
  const p = clamp(Number.isFinite(t) ? t : 0, 0, 1)
  const from = a ?? { scale: 1, dx: 0, dy: 0 }
  const to = b ?? from
  return {
    scale: from.scale + (to.scale - from.scale) * p,
    dx: from.dx + (to.dx - from.dx) * p,
    dy: from.dy + (to.dy - from.dy) * p,
  }
}

export function resolveDesign(backdrop, override = null) {
  if (override?.width > 0 && override?.height > 0) {
    return { width: override.width, height: override.height }
  }
  if (backdrop?.width > 0 && backdrop?.height > 0) {
    return { width: backdrop.width, height: backdrop.height }
  }
  // Fallback when no backdrop is available (or its size could not be read).
  return { ...FALLBACK_DESIGN }
}

// How the design canvas maps to a screen of `viewport` size.
export function designScale(design, viewport, fit = 'contain') {
  const sx = viewport.width / design.width
  const sy = viewport.height / design.height
  return fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy)
}

// The overscan render surface is `overscan` times the design canvas, but it must
// still cover the WHOLE viewport once the canvas is contain-fitted. A square (or
// portrait) canvas inside a wide viewport leaves letterbox wider than the fixed
// margin, so the WebGL bitmap ends short of the screen edge and a panned /
// enlarged model gets hard-clipped mid-letterbox (≈8% in on a 16:9 screen). The
// configured value is therefore a MINIMUM; the surface grows to whichever the
// viewport needs on each axis, so the model can always reach the true screen
// edge. Pure: importable from Node for the invariants.
export function effectiveOverscan(design, viewport, min = 1) {
  const dw = design?.width ?? 0
  const dh = design?.height ?? 0
  const vw = viewport?.width ?? 0
  const vh = viewport?.height ?? 0
  if (!(dw > 0 && dh > 0 && vw > 0 && vh > 0)) return Math.max(min, 1)
  const s = designScale(design, viewport, 'contain')
  if (!(s > 0)) return Math.max(min, 1)
  // surface on-screen size = design * overscan * s must cover the viewport.
  const neededW = vw / (dw * s)
  const neededH = vh / (dh * s)
  return Math.max(min, neededW, neededH)
}

// Normalise the parallax block. Unknown / missing numbers fall back to 0 so a
// half-written config file cannot make a layer jump.
export function resolveParallax(spec = {}) {
  const s = spec ?? {}
  return {
    enabled: s.enabled !== false,
    backdrop: Number.isFinite(s.backdrop) ? s.backdrop : 0,
    model: Number.isFinite(s.model) ? s.model : 0,
  }
}

const clampUnit = (value) => clamp(Number.isFinite(value) ? value : 0, -1, 1)

// Parallax offset for ONE layer, in design pixels. `strength` is a percentage
// of the design canvas, `pointer` is the normalised cursor position in -1..1
// on both axes (x: left..right, y: top..bottom). Positive strength = the layer
// moves in the same direction as the pointer, negative = the opposite way.
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
export function modelBaseRect(design, model, setupBounds, zoom = 1) {
  const m = model ?? {}
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
export function compositionRects(design, backdropSpec, modelSpec, setupBounds, options = {}) {
  const base = { cx: design.width / 2, cy: design.height / 2, w: design.width, h: design.height }
  return {
    backdrop: layerRect(base, resolveLayerTransform(backdropSpec, design)),
    model: layerRect(
      modelBaseRect(design, options.model, setupBounds, options.zoom),
      resolveLayerTransform(modelSpec, design),
    ),
  }
}

export function normalizeRect(rect, design) {
  return [rect.cx / design.width, rect.cy / design.height, rect.w / design.width, rect.h / design.height]
}
