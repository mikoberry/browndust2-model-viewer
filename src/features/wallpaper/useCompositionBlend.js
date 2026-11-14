// Cross-fade between framings while the entrance sequence runs, and from the
// entrance into the wallpaper's resting framing.
//
// A BD2 scene is a chain of shots (cut_A -> cut_B -> loop_2) and each shot has
// its own backdrop / scale / offsets, so the target changes several times inside
// one second of playback. Every one of those transitions is eased over
// `entrance.blend` seconds; once the sequence is over, ordinary edits (drawer
// sliders, a different backdrop) snap, exactly as before.
//
// Why a hook and not React state: this runs at 60fps for ~1s and would otherwise
// re-render the whole wallpaper (including every WallKit widget). It writes the
// same two imperative channels the rest of the composition uses:
//
//   * backdrop -> `--backdrop-x` / -y / -scale on the backdrop STACK wrapper
//     (`.wallpaper-backdrop-stack`); custom properties inherit, so every
//     stacked <img> layer shares one transform and cross-fades move together;
//   * model    -> a ref SpineStage reads every frame instead of its `transform`
//     prop.
//
// Everything is in design-canvas units, so the fade is identical on every
// resolution / DPR / fit mode.

import { useEffect, useRef } from 'react'
import { blendLayerTransform } from '../../lib/composition.js'

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

const clone = (value) => ({
  backdrop: { ...value.backdrop },
  model: { ...value.model },
})

// Resolved layers are `{ scale, dx, dy }` on both sides (see resolveLayerTransform).
const sameLayer = (a, b) =>
  a.scale === b.scale &&
  Math.abs(a.dx - b.dx) < 0.01 &&
  Math.abs(a.dy - b.dy) < 0.01

const sameValue = (a, b) => sameLayer(a.backdrop, b.backdrop) && sameLayer(a.model, b.model)

export default function useCompositionBlend({ backdropEl, modelTransformRef, target, active, duration = 0 }) {
  const currentRef = useRef(null)
  const rafRef = useRef(0)
  const pendingRef = useRef(target)
  pendingRef.current = target
  const wasActiveRef = useRef(active)

  useEffect(() => {
    const write = (value) => {
      if (backdropEl) {
        backdropEl.style.setProperty('--backdrop-x', `${value.backdrop.dx.toFixed(2)}px`)
        backdropEl.style.setProperty('--backdrop-y', `${value.backdrop.dy.toFixed(2)}px`)
        backdropEl.style.setProperty('--backdrop-scale', value.backdrop.scale.toFixed(4))
      }
      if (modelTransformRef) modelTransformRef.current = { ...value.model }
    }

    const next = clone(pendingRef.current)
    const leavingEntrance = wasActiveRef.current && !active
    // The entrance OPENS on its first shot: nothing of the sequence is on screen
    // before it, so the hand-off from the resting composition must be a hard cut,
    // not a fade. Easing it used to be hidden behind the loading cover only in
    // theory — the cover starts lifting at the same moment and takes 0.5s, so a
    // 0.9s fade leaked out as a "short rest-framing -> clip 1" slide right after
    // the load screen (the exact symptom reported).
    const enteringEntrance = !wasActiveRef.current && active
    wasActiveRef.current = active

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }

    const from = currentRef.current
    // Ease every target change that happens inside (or right after) the
    // sequence — that is one call per clip boundary plus the final hand-off.
    // Everything else snaps: the first application, the entrance's own first
    // shot, a drawer slider, a backdrop swap, or `blend` disabled.
    const animate = !enteringEntrance && (active || leavingEntrance) && duration > 0
    if (!from || !animate || sameValue(from, next)) {
      currentRef.current = next
      write(next)
      return undefined
    }

    const span = duration * 1000
    const start = performance.now()
    const step = (now) => {
      const progress = Math.min(1, (now - start) / Math.max(span, 16))
      const value = {
        backdrop: blendLayerTransform(from.backdrop, next.backdrop, easeInOut(progress)),
        model: blendLayerTransform(from.model, next.model, easeInOut(progress)),
      }
      currentRef.current = value
      write(value)
      rafRef.current = progress < 1 ? requestAnimationFrame(step) : 0
    }
    rafRef.current = requestAnimationFrame(step)
    return undefined
  }, [backdropEl, modelTransformRef, target, active, duration])

  // Unmounting mid-fade must not leave a queued frame behind.
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])
}
