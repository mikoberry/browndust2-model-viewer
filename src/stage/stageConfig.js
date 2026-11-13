// Stage constants: which model to load, how to frame it, how the backdrop looks.
// Every tunable that a designer would touch lives here — components read these,
// they do not hardcode layout numbers.

export const MODEL = {
  dir: 'models/wilhelmina/',
  name: 'cutscene_char067601',
  // Union of `loop_2` (idle) world bounds, measured from the skeleton data.
  idleBounds: { x: -988, y: -1551, w: 2326, h: 2002 },
}

// Framing is resolution-independent: the figure's bounds height maps to
// figureHeight * viewport height, and the bounds center is pinned to
// (anchorX * viewport width, anchorY * viewport height).
// anchorX refers to the BOUNDS center, not the visual body: the greatsword
// extends far to the left of the figure, pulling the bounds center left, so
// 0.45 puts the visual body roughly on the throne with the sword reaching left.
export const FRAMING = {
  figureHeight: 0.9, // bounds height / viewport height
  anchorX: 0.45, // bounds center x / viewport width
  anchorY: 1.0, // bounds bottom y / viewport height (feet on screen bottom)
}

// Click performance: ease figureHeight 0.90 -> 0.96 for a camera push-in.
// Without it, `cut_B` differs so little from `loop_2` that the click would
// look like nothing happened.
export const PERFORM_ZOOM = {
  figureHeight: 0.96,
  ease: 5, // exponential damping rate /s; ~95% done in 600ms
}

export const BACKDROP = {
  src: 'models/wilhelmina/back1.webp',
  fit: 'cover',
  // The throne hall is bright; 0.94 only takes the edge off. Dimming further
  // washes the scene gray.
  dim: 0.94,
  vignette: 0.22,
  grain: 0.02,
}

// Pointer parallax: camera drift as a fraction of the viewport, exponential
// damping toward the pointer target. Parallax only ever touches camera
// position — never bones.
export const PARALLAX = {
  maxOffsetX: 0.012, // 1.2% of viewport width
  maxOffsetY: 0.006, // half that vertically, keeps feet planted
  damping: 6, // /s
}

// Animation names per choreography state (see choreography.js).
export const ANIMS = {
  idle: 'loop_2', // 4.00s stand-and-hold loop
  perform: 'cut_B', // 3.33s performance, same stance as idle
  ambient: 'loop', // 8.00s turned-away variant (opt-in)
}

// Crossfade times. idle<->perform share a stance so they cut fast; the ambient
// pose is a different body orientation and needs a slow blend or it looks
// like a glitch.
export const MIX = {
  default: 0.2,
  ambient: 0.8,
}
