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
  // Central band (design pixels) visible after cover cropping on BOTH a 16:9
  // and a 9:16 screen — the toolbar's 「交叉区域」 overlay. Null hides it.
  crossRect = null,
  // Filled with `{ el, scale }` (the design element + its mapped scale) so the
  // parent can drive camera moves per frame without re-rendering this component.
  cameraHostRef = null,
  children,
}) {
  const wrapRef = useRef(null)
  const designElRef = useRef(null)
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

  // Publish the design element + its mapped scale for the parent's per-frame
  // camera driver (see ViewerPage's handleSequenceFrame). In the plain (non-
  // composed) mode there is no design element and no camera, hence scale 0.
  const scale = enabled && viewport.width > 0 ? designScale(design, viewport, 'contain') : 0
  useEffect(() => {
    if (!cameraHostRef) return undefined
    cameraHostRef.current = { el: designElRef.current, scale, width: design.width, height: design.height }
    return undefined
  }, [cameraHostRef, scale, design.width, design.height])

  if (!enabled) {
    return (
      <div className="compose-viewport is-plain" ref={wrapRef}>
        <div className="compose-surface">{children}</div>
      </div>
    )
  }

  const t = transform ?? { scale: 1, dx: 0, dy: 0 }
  const surface = Math.max(overscan, 1)
  const left = (viewport.width - design.width * scale) / 2
  const top = (viewport.height - design.height * scale) / 2

  return (
    <div className={`compose-viewport${scale > 0 ? ' is-ready' : ''}`} ref={wrapRef}>
      <div
        className="compose-design"
        ref={designElRef}
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
      {/* Cross overlay lives in VIEWPORT pixels, not design pixels: inside the
          scaled canvas a 1px border would shrink to a sub-pixel hairline and
          all but vanish. The canvas is centred in the viewport and the crop
          windows are centred on the canvas, so a viewport-centred box is the
          same region — just always readable. */}
      {crossRect && scale > 0 && (
        <div
          className="compose-cross"
          style={{ width: crossRect.width * scale, height: crossRect.height * scale }}
          title="当前屏幕方向与其相反方向 cover 裁切后都可见的交叠区域"
        />
      )}
    </div>
  )
}
