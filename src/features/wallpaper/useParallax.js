// Mouse parallax driver for the wallpaper route.
//
// The pointer is normalised to the viewport (-1..1 on both axes) and then eased
// towards the target position, so the artwork glides instead of snapping. Two
// independent offsets are produced from that ONE normalised pointer:
//
//   * backdrop -> written as CSS custom properties (`--parallax-x` / -y) on the
//     design canvas, where .wallpaper-backdrop's transform picks them up. No
//     React state, so a 60fps drift never re-renders the tree;
//   * model    -> written into a ref that SpineStage reads every frame and adds
//     to the camera target, i.e. in design pixels just like the layer offset.
//
// Both offsets come from parallaxOffset(), which is linear in the strength, so
// easing the strength IS easing the offset. The rAF loop only runs while
// something is still easing: once pointer and strengths reach their goals it
// stops, which keeps an idle wallpaper from burning a frame budget forever.
//
// `suppress` (true while the entrance sequence plays) must NOT toggle the
// strengths directly: swapping the parallax config re-runs this effect, and
// parking the offsets at zero in one frame snaps BOTH layers by the current
// drift — that was the visible "flash" at entrance start / end. Instead the
// two strengths ease towards zero and back, so the drift fades out and in
// while a cutscene runs its own camera.

import { useEffect, useRef } from 'react'
import { parallaxOffset } from './config.js'

// Higher = snappier. 9/s glides for ~250ms, which reads as "follows the mouse"
// without feeling laggy on a 60Hz wallpaper.
const EASE_PER_SECOND = 9
// Strengths ease a touch slower so suppress / release reads as a fade, not a
// blink, and lands well inside the entrance cross-fade window.
const STRENGTH_EASE_PER_SECOND = 6
const SETTLE = 5e-4

export default function useParallax({ design, parallax, designRef, modelOffsetRef, suppress = false }) {
  const enabled = parallax?.enabled !== false
  const backdrop = Number.isFinite(parallax?.backdrop) ? parallax.backdrop : 0
  const model = Number.isFinite(parallax?.model) ? parallax.model : 0
  const width = design?.width ?? 0
  const height = design?.height ?? 0

  // Eased state lives in refs so a suppress / strength toggle (an effect
  // re-run) keeps the current offset and fades from it instead of restarting
  // at the neutral composition.
  const pointerRef = useRef({ x: 0, y: 0 }) // target pointer, normalised
  const easedRef = useRef({ x: 0, y: 0 }) // eased pointer
  const strengthRef = useRef({ backdrop: 0, model: 0 }) // eased strengths
  const rafRef = useRef(0)
  const lastRef = useRef(0)

  useEffect(() => {
    const node = designRef?.current ?? null
    const resolved = { width, height }

    const write = () => {
      const back = parallaxOffset(strengthRef.current.backdrop, resolved, easedRef.current)
      const front = parallaxOffset(strengthRef.current.model, resolved, easedRef.current)
      if (node) {
        node.style.setProperty('--parallax-x', `${back.x.toFixed(2)}px`)
        node.style.setProperty('--parallax-y', `${back.y.toFixed(2)}px`)
      }
      if (modelOffsetRef) modelOffsetRef.current = front
    }

    const frame = (now) => {
      rafRef.current = 0
      const dt = lastRef.current ? Math.min((now - lastRef.current) / 1000, 0.1) : 1 / 60
      lastRef.current = now

      // Ease the pointer towards its target…
      const pointer = pointerRef.current
      const eased = easedRef.current
      const k = 1 - Math.exp(-EASE_PER_SECOND * dt)
      eased.x += (pointer.x - eased.x) * k
      eased.y += (pointer.y - eased.y) * k

      // …and each strength towards its goal (zero while suppressed / disabled).
      const wantBackdrop = enabled && !suppress ? backdrop : 0
      const wantModel = enabled && !suppress ? model : 0
      const ks = 1 - Math.exp(-STRENGTH_EASE_PER_SECOND * dt)
      const strength = strengthRef.current
      strength.backdrop += (wantBackdrop - strength.backdrop) * ks
      strength.model += (wantModel - strength.model) * ks

      write()

      const settledPointer =
        Math.abs(pointer.x - eased.x) < SETTLE && Math.abs(pointer.y - eased.y) < SETTLE
      const settledStrength =
        Math.abs(wantBackdrop - strength.backdrop) < SETTLE &&
        Math.abs(wantModel - strength.model) < SETTLE
      if (!settledPointer || !settledStrength) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        // Park exactly on goal so a paused loop never leaves residue behind.
        eased.x = pointer.x
        eased.y = pointer.y
        strength.backdrop = wantBackdrop
        strength.model = wantModel
        write()
        lastRef.current = 0
      }
    }

    const kick = () => {
      if (rafRef.current) return
      lastRef.current = 0
      rafRef.current = requestAnimationFrame(frame)
    }

    const onPointerMove = (event) => {
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      pointerRef.current.x = (event.clientX / w) * 2 - 1
      pointerRef.current.y = (event.clientY / h) * 2 - 1
      kick()
    }

    // Cursor outside the wallpaper (very common in Wallpaper Engine): glide
    // back to the neutral composition instead of freezing at the last edge.
    const onLeave = () => {
      pointerRef.current.x = 0
      pointerRef.current.y = 0
      kick()
    }

    // Always run at least one frame after (re)mounting, so a suppress toggle
    // or a strength edit eases from the current offset instead of snapping.
    kick()
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('blur', onLeave)
    document.documentElement.addEventListener('pointerleave', onLeave)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', onLeave)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [enabled, backdrop, model, suppress, width, height, designRef, modelOffsetRef])
}
