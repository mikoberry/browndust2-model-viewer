// Fixed-design-canvas wrapper used by the viewer's composition preview.
//
// It draws exactly what the wallpaper draws: one virtual canvas sized in design
// pixels, holding the backdrop <img> and the SpineStage, then scaled as a whole
// to fit the stage area. Both layers are children of the SAME transform, so the
// preview shows the real relative geometry on any window size.
//
// With `enabled` off it degrades to a plain full-size box and the stage keeps its
// debug camera — the element tree stays identical, so toggling the preview never
// remounts the WebGL stage (no asset reload while tuning).

import { useEffect, useRef, useState } from 'react'
import { designScale } from '../../../lib/composition.js'

export default function CompositionStage({
  enabled = false,
  design,
  backdropUrl = '',
  transform = null,
  overscan = 1.5,
  children,
}) {
  const wrapRef = useRef(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

  // The stage area is a flex child, so its size is only known after layout and
  // changes with the window / sidebar. ResizeObserver rather than window.resize.
  useEffect(() => {
    const node = wrapRef.current
    if (!node) return undefined
    const measure = () => setViewport({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  if (!enabled) {
    return (
      <div className="compose-viewport is-plain" ref={wrapRef}>
        <div className="compose-surface">{children}</div>
      </div>
    )
  }

  const t = transform ?? { scale: 1, dx: 0, dy: 0 }
  const surface = Math.max(overscan, 1)
  const scale = viewport.width > 0 ? designScale(design, viewport, 'contain') : 0
  const left = (viewport.width - design.width * scale) / 2
  const top = (viewport.height - design.height * scale) / 2

  return (
    <div className={`compose-viewport${scale > 0 ? ' is-ready' : ''}`} ref={wrapRef}>
      <div
        className="compose-design"
        style={{ width: design.width, height: design.height, left, top, transform: `scale(${scale})` }}
      >
        {backdropUrl && (
          <img
            className="compose-backdrop"
            src={backdropUrl}
            alt=""
            draggable="false"
            style={{ transform: `translate(${t.dx}px, ${t.dy}px) scale(${t.scale})` }}
          />
        )}
        <div className="compose-surface" style={{ inset: `${-((surface - 1) / 2) * 100}%` }}>
          {children}
        </div>
      </div>
    </div>
  )
}
