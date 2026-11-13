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
// Both offsets come from parallaxOffset(), so they stay in design coordinates
// and are identical on every resolution / DPR / fit mode. The rAF loop only runs
// while the pointer is moving: once the eased position reaches the target it
// stops, which keeps an idle wallpaper from burning a frame budget forever.

import { useEffect } from 'react'
import { parallaxOffset } from './config.js'

// Higher = snappier. 9/s glides for ~250ms, which reads as "follows the mouse"
// without feeling laggy on a 60Hz wallpaper.
const EASE_PER_SECOND = 9
const SETTLE = 5e-4

export default function useParallax({ design, parallax, designRef, modelOffsetRef }) {
  const enabled = parallax?.enabled !== false
  const backdrop = Number.isFinite(parallax?.backdrop) ? parallax.backdrop : 0
  const model = Number.isFinite(parallax?.model) ? parallax.model : 0
  const width = design?.width ?? 0
  const height = design?.height ?? 0

  useEffect(() => {
    const node = designRef?.current ?? null
    const resolved = { width, height }

    const apply = (pointer) => {
      const back = parallaxOffset(backdrop, resolved, pointer)
      const front = parallaxOffset(model, resolved, pointer)
      if (node) {
        node.style.setProperty('--parallax-x', `${back.x.toFixed(2)}px`)
        node.style.setProperty('--parallax-y', `${back.y.toFixed(2)}px`)
      }
      if (modelOffsetRef) modelOffsetRef.current = front
    }

    // Nothing to animate: park both layers at their composed position.
    if (!enabled || (!backdrop && !model)) {
      apply({ x: 0, y: 0 })
      return () => {
        apply({ x: 0, y: 0 })
        if (modelOffsetRef) modelOffsetRef.current = { x: 0, y: 0 }
      }
    }

    const target = { x: 0, y: 0 }
    const current = { x: 0, y: 0 }
    let rafId = 0
    let last = 0

    const frame = (now) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60
      last = now
      const k = 1 - Math.exp(-EASE_PER_SECOND * dt)
      current.x += (target.x - current.x) * k
      current.y += (target.y - current.y) * k
      const settled = Math.abs(target.x - current.x) < SETTLE && Math.abs(target.y - current.y) < SETTLE
      if (settled) {
        current.x = target.x
        current.y = target.y
      }
      apply(current)
      rafId = settled ? 0 : requestAnimationFrame(frame)
    }

    const kick = () => {
      if (rafId) return
      last = 0
      rafId = requestAnimationFrame(frame)
    }

    const onPointerMove = (event) => {
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      target.x = (event.clientX / w) * 2 - 1
      target.y = (event.clientY / h) * 2 - 1
      kick()
    }

    // Cursor outside the wallpaper (very common in Wallpaper Engine): glide
    // back to the neutral composition instead of freezing at the last edge.
    const onLeave = () => {
      target.x = 0
      target.y = 0
      kick()
    }

    apply(current)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('blur', onLeave)
    document.documentElement.addEventListener('pointerleave', onLeave)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', onLeave)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      if (modelOffsetRef) modelOffsetRef.current = { x: 0, y: 0 }
    }
  }, [enabled, backdrop, model, width, height, designRef, modelOffsetRef])
}
