// The WebGL canvas: render loop, orthographic camera, pointer interaction and
// all AnimationState side effects. It knows nothing about the surrounding UI;
// the parent drives it through props and receives progress / stats back.

import { useEffect, useRef, useState } from 'react'
import { ManagedWebGLRenderingContext, SceneRenderer } from '@esotericsoftware/spine-webgl'
import { useSpineAsset, readAssetInfo } from './useSpineAsset.js'

const FIT_RATIO = 0.86
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function configureDebugRenderer(renderer) {
  const debug = renderer.skeletonDebugRenderer
  debug.drawBones = true
  debug.drawRegionAttachments = false
  debug.drawBoundingBoxes = false
  debug.drawMeshHull = false
  debug.drawMeshTriangles = false
  debug.drawPaths = false
  debug.drawClipping = false
  debug.boneWidth = 1.5
}

export default function SpineStage(props) {
  const {
    model,
    animation,
    expression,
    skin,
    playing,
    speed,
    loop,
    zoom,
    showBones,
    showBounds,
    infoReady,
    fitToken,
    resetToken,
    seek,
    onZoomChange,
    onProgress,
    onStats,
    onLoaded,
    onError,
    onFit,
    // "Bare" mode used by the wallpaper route. Defaults keep the debug
    // viewer's behaviour unchanged (framed with a margin, interactive).
    fitRatio = FIT_RATIO,
    interactive = true,
    showLoading = true,
    // Fixed design canvas { width, height, model, transform? }. When present,
    // the camera uses the immutable setup bounds and one shared
    // design->screen transform. `transform` is the model layer's independent
    // { scale, dx, dy } in DESIGN pixels, resolved by config/wallpaper.js.
    design = null,
  } = props

  const canvasRef = useRef(null)
  const runtimeRef = useRef(null)
  const boundsBoxRef = useRef(null)
  const [glContext, setGlContext] = useState(null)

  // Every prop the rAF loop needs is mirrored into a ref, so the loop is
  // created once per asset instead of being torn down on every UI change.
  const liveRef = useRef(null)
  // Mirror resolved defaults too, so the loop sees the same values as the JSX.
  liveRef.current = { ...props, fitRatio, interactive, showLoading, design }

  const boundsRef = useRef({ x: -500, y: -500, w: 1000, h: 1000 })
  const panRef = useRef({ x: 0, y: 0 })
  const worldZoomRef = useRef(1)
  const fitPendingRef = useRef(true)
  const draggingRef = useRef(null)

  const { asset, error, phase } = useSpineAsset(glContext, model)

  // Create the GL context and scene renderer once for the lifetime of the page.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    let ctx = null
    let renderer = null
    try {
      ctx = new ManagedWebGLRenderingContext(canvas, {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
      })
      renderer = new SceneRenderer(canvas, ctx, true)
      configureDebugRenderer(renderer)
      runtimeRef.current = { ctx, renderer }
      setGlContext(ctx)
    } catch (err) {
      liveRef.current.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
    return () => {
      try {
        renderer?.dispose()
      } catch {
        // context may already be lost
      }
      runtimeRef.current = null
    }
  }, [])

  useEffect(() => {
    if (error) liveRef.current.onError?.(error)
  }, [error])

  useEffect(() => {
    if (!asset) return
    panRef.current = { x: 0, y: 0 }
    fitPendingRef.current = true
  }, [asset])

  // Report the loaded skeleton to the parent. Also self-heals if the parent's
  // inspector state was cleared without the asset changing (selecting the same
  // model, a failed reload, etc.). App ignores reports for stale model ids.
  useEffect(() => {
    if (!asset || infoReady) return
    liveRef.current.onLoaded?.(readAssetInfo(asset))
  }, [asset, infoReady])

  // Track 0: the selected body animation.
  useEffect(() => {
    if (!asset || !animation || !asset.data.findAnimation(animation)) return
    asset.state.setAnimation(0, animation, liveRef.current.loop)
    fitPendingRef.current = true
  }, [asset, animation])

  // Track 1: BD2 character portraits keep facial features in _faceN
  // animations; without one the face renders as a blank white mask.
  useEffect(() => {
    if (!asset) return
    if (expression && asset.data.findAnimation(expression)) {
      asset.state.setAnimation(1, expression, true)
    } else {
      asset.state.clearTrack(1)
    }
  }, [asset, expression])

  useEffect(() => {
    if (!asset) return
    const track = asset.state.getCurrent(0)
    if (track) track.loop = loop
  }, [asset, loop])

  useEffect(() => {
    if (!asset || !skin) return
    try {
      asset.skeleton.setSkinByName(skin)
      asset.skeleton.setSlotsToSetupPose()
      fitPendingRef.current = true
    } catch (err) {
      liveRef.current.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }, [asset, skin])

  useEffect(() => {
    if (!seek || !asset) return
    const track = asset.state.getCurrent(0)
    if (!track) return
    track.trackTime = clamp(seek.value, 0, 1) * track.animation.duration
    asset.state.apply(asset.skeleton)
    asset.skeleton.updateWorldTransform()
  }, [asset, seek?.token])

  useEffect(() => {
    fitPendingRef.current = true
  }, [fitToken])

  useEffect(() => {
    panRef.current = { x: 0, y: 0 }
    fitPendingRef.current = true
  }, [resetToken])

  // Native wheel listener so preventDefault actually works (React attaches
  // wheel handlers as passive in some versions).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !interactive) return undefined
    const onWheel = (event) => {
      event.preventDefault()
      const live = liveRef.current
      const factor = Math.exp(-event.deltaY * 0.0012)
      const nextZoom = clamp(live.zoom * factor, MIN_ZOOM, MAX_ZOOM)
      if (nextZoom === live.zoom) return

      // Keep the world point under the cursor fixed while zooming.
      const rect = canvas.getBoundingClientRect()
      const dpr = canvas.width / Math.max(rect.width, 1)
      const dx = (event.clientX - rect.left) * dpr - canvas.width / 2
      const dy = (event.clientY - rect.top) * dpr - canvas.height / 2
      const z0 = worldZoomRef.current
      const z1 = z0 * (live.zoom / nextZoom)
      const b = boundsRef.current
      const centerX = b.x + b.w / 2
      const centerY = b.y + b.h / 2
      const camX0 = centerX + panRef.current.x
      const camY0 = centerY + panRef.current.y
      const worldX = camX0 + dx * z0
      const worldY = camY0 - dy * z0
      panRef.current = {
        x: worldX - dx * z1 - centerX,
        y: worldY + dy * z1 - centerY,
      }
      live.onZoomChange?.(nextZoom)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [interactive])

  // The render loop. Depends only on the loaded asset; UI state is read live.
  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime || !asset) return undefined
    const { ctx, renderer } = runtime
    const gl = ctx.gl
    const { skeleton, state } = asset

    let rafId = 0
    let lastTime = performance.now()
    let lastProgress = 0
    let fpsClock = lastTime
    let frames = 0

    const frame = (now) => {
      rafId = requestAnimationFrame(frame)
      const live = liveRef.current
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now

      if (live.playing) state.update(dt * live.speed)
      state.apply(skeleton)
      skeleton.updateWorldTransform()

      // Bounds are pose-dependent; recompute when the model / animation
      // changes or the user presses "fit". getBoundsRect is expensive, so it
      // never runs on every frame.
      if (fitPendingRef.current) {
        const r = skeleton.getBoundsRect()
        if (Number.isFinite(r.x) && r.width > 1 && r.height > 1) {
          boundsRef.current = { x: r.x, y: r.y, w: r.width, h: r.height }
        }
        fitPendingRef.current = false
      }

      const canvas = canvasRef.current
      const cssWidth = Math.max(canvas.clientWidth, 1)
      const cssHeight = Math.max(canvas.clientHeight, 1)
      // The wallpaper scales its fixed design canvas with a CSS transform, so
      // the canvas is displayed larger/smaller than its layout size. Render at
      // the real displayed size to keep it sharp on any screen; with no
      // transform displayScale is 1 and the debug viewer behaves as before.
      const rect = canvas.getBoundingClientRect()
      const displayScale = Math.max(rect.width / cssWidth, rect.height / cssHeight, 0.01)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const renderScale = Math.min(dpr * displayScale, 3)
      const width = Math.max(1, Math.round(cssWidth * renderScale))
      const height = Math.max(1, Math.round(cssHeight * renderScale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
        renderer.camera.setViewport(width, height)
      }

      const d = live.design
      const sb = asset.setupBounds
      const fixed = d && sb && d.width > 0 && d.height > 0
      // Fixed mode uses the immutable setup-pose bounds, never the live pose,
      // otherwise an animation would silently shift the composition.
      const b = fixed ? { x: sb.x, y: sb.y, w: sb.width, h: sb.height } : boundsRef.current
      const centerX = b.x + b.w / 2
      const centerY = b.y + b.h / 2

      let worldZoom
      let camX
      let camY
      if (fixed) {
        // Design pixels -> device pixels, one factor shared with the backdrop.
        // d.width is also the canvas layout width, so k === renderScale.
        const k = width / d.width
        const m = d.model ?? {}
        const hRatio = m.heightRatio > 0 ? m.heightRatio : 1
        const wRatio = m.widthRatio > 0 ? m.widthRatio : 1
        const alignX = Number.isFinite(m.alignX) ? m.alignX : 0.5
        const alignY = Number.isFinite(m.alignY) ? m.alignY : 0.5
        // Independent model-layer adjustment, in design pixels. Dividing the
        // worldZoom scales the drawn model by `layerScale`; adding the offsets
        // to the camera target moves its centre by exactly (dx, dy) design px,
        // independent of that scale — the same semantics as the backdrop's
        // CSS `translate(dx,dy) scale(s)` (transform-origin 50% 50%).
        const t = d.transform ?? {}
        const layerScale = t.scale > 0 ? t.scale : 1
        const offsetX = Number.isFinite(t.dx) ? t.dx : 0
        const offsetY = Number.isFinite(t.dy) ? t.dy : 0
        worldZoom =
          Math.max(b.h / (d.height * hRatio * k), b.w / (d.width * wRatio * k)) /
          (Math.max(live.zoom, MIN_ZOOM) * layerScale)
        // Target of the model centre in design space (device px from centre).
        // World -> screen is px = (wx - camX) / worldZoom (Y is flipped), so
        // solving for the camera centre gives the two lines below.
        const targetX = ((alignX - 0.5) * d.width + offsetX) * k
        const targetY = ((alignY - 0.5) * d.height + offsetY) * k
        camX = centerX - targetX * worldZoom + panRef.current.x
        camY = centerY + targetY * worldZoom + panRef.current.y
      } else {
        // OrthoCamera.zoom is world units per device pixel. A larger fitRatio
        // fills more of the viewport.
        const ratio = live.fitRatio > 0 ? live.fitRatio : FIT_RATIO
        worldZoom =
          Math.max(b.h / (height * ratio), b.w / (width * ratio)) /
          Math.max(live.zoom, MIN_ZOOM)
        camX = centerX + panRef.current.x
        camY = centerY + panRef.current.y
      }
      worldZoomRef.current = worldZoom

      const cam = renderer.camera
      cam.zoom = worldZoom
      cam.position.set(camX, camY, 0)
      cam.update()

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      // BD2 atlases are NOT premultiplied. Passing true paints a white slab
      // over the large translucent cutscene overlays — this must stay false.
      renderer.begin()
      renderer.drawSkeleton(skeleton, false)
      if (live.showBones) renderer.drawSkeletonDebug(skeleton, false)
      renderer.end()

      // Setup-pose AABB overlay, positioned in CSS pixels over the canvas.
      const box = boundsBoxRef.current
      if (box) {
        if (!live.showBounds) {
          // Avoid a DOM write (and a forced reflow) on every frame: the render
          // loop reads getBoundingClientRect to track CSS transforms.
          if (box.style.display !== 'none') box.style.display = 'none'
        } else {
          const pxPerCss = width / Math.max(canvas.clientWidth, 1)
          const left = (b.x - camX) / worldZoom + width / 2
          const top = (camY - (b.y + b.h)) / worldZoom + height / 2
          box.style.display = 'block'
          box.style.left = `${left / pxPerCss}px`
          box.style.top = `${top / pxPerCss}px`
          box.style.width = `${b.w / worldZoom / pxPerCss}px`
          box.style.height = `${b.h / worldZoom / pxPerCss}px`
        }
      }

      const track = state.getCurrent(0)
      if (track && now - lastProgress > 100) {
        lastProgress = now
        const duration = track.animation.duration
        const time = Math.min(track.trackTime, duration)
        live.onProgress?.({ time, duration, percent: duration > 0 ? time / duration : 0 })
      }

      frames += 1
      if (now - fpsClock >= 500) {
        live.onStats?.({ fps: Math.round((frames * 1000) / (now - fpsClock)) })
        frames = 0
        fpsClock = now
      }
    }

    rafId = requestAnimationFrame((t) => {
      lastTime = t
      fpsClock = t
      frame(t)
    })
    return () => cancelAnimationFrame(rafId)
  }, [asset])

  const onPointerDown = (event) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = { x: event.clientX, y: event.clientY }
  }

  const onPointerMove = (event) => {
    const drag = draggingRef.current
    if (!drag) return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const dpr = canvas.width / Math.max(rect.width, 1)
    const dx = (event.clientX - drag.x) * dpr
    const dy = (event.clientY - drag.y) * dpr
    drag.x = event.clientX
    drag.y = event.clientY
    const worldPerPixel = worldZoomRef.current
    panRef.current.x -= dx * worldPerPixel
    panRef.current.y += dy * worldPerPixel
  }

  const stopDragging = () => {
    draggingRef.current = null
  }

  return (
    <div className="stage-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="stage-canvas"
        aria-label="Spine 模型画布"
        onPointerDown={interactive ? onPointerDown : undefined}
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerUp={interactive ? stopDragging : undefined}
        onPointerCancel={interactive ? stopDragging : undefined}
        onLostPointerCapture={interactive ? stopDragging : undefined}
        onDoubleClick={interactive ? () => onFit?.() : undefined}
      />
      <div ref={boundsBoxRef} className="stage-bounds" aria-hidden="true" />
      {showLoading && (phase === 'idle' || phase === 'loading') && (
        <div className="stage-loading" role="status">
          <span className="stage-loading-spinner" />
          正在载入 {model?.label ?? '模型'}…
        </div>
      )}
    </div>
  )
}
