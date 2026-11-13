// SpineStage: the WebGL canvas and the render loop. It owns the camera
// (framing + parallax + perform push-in) and the spine AnimationState.
// It never reads WE APIs and never imports controls; the parent feeds it a
// choreography state and receives timeline events back.

import { useEffect, useRef, useState } from 'react'
import {
  ManagedWebGLRenderingContext,
  SceneRenderer,
} from '@esotericsoftware/spine-webgl'
import { useSpineAsset } from './useSpineAsset.js'
import {
  ANIMS,
  FRAMING,
  MIX,
  MODEL,
  PARALLAX,
  PERFORM_ZOOM,
} from './stageConfig.js'

// Camera math (see docs §5): spine-webgl Camera.zoom is world units per pixel.
// Visible world height = canvasHeight * zoom, so pinning the figure's bounds
// height to figureHeight * viewport height gives:
//   zoom = bounds.h / (viewportH * figureHeight)
// Screen position of world point p: screenY = H/2 + (camY - p) / zoom
// (world y grows upward, screen y grows downward). Pinning the bounds bottom
// to anchorY * viewportH and the bounds center to anchorX * viewportW:
//   camX = centerX - (anchorX - 0.5) * viewportW * zoom
//   camY = bottomY + (anchorY - 0.5) * viewportH * zoom
function cameraFor(viewportW, viewportH, figureHeight) {
  const b = MODEL.idleBounds
  const zoom = b.h / (viewportH * figureHeight)
  const centerX = b.x + b.w / 2
  const bottomY = b.y
  return {
    zoom,
    x: centerX - (FRAMING.anchorX - 0.5) * viewportW * zoom,
    y: bottomY + (FRAMING.anchorY - 0.5) * viewportH * zoom,
  }
}

function applyMixes(stateData) {
  const names = Object.values(ANIMS)
  for (const from of names) {
    for (const to of names) {
      if (from === to) continue
      const touchesAmbient = from === ANIMS.ambient || to === ANIMS.ambient
      stateData.setMix(from, to, touchesAmbient ? MIX.ambient : MIX.default)
    }
  }
}

export default function SpineStage({ state, paused, parallax, onFinished, onClick }) {
  const canvasRef = useRef(null)
  const onClickRef = useRef(onClick)
  onClickRef.current = onClick
  const [context, setContext] = useState(null)
  const { asset, error } = useSpineAsset(context)

  // Mutable render state lives in refs so the rAF loop reads stable objects.
  const runtimeRef = useRef(null)
  const ctxRef = useRef(null)
  // figureHeight eases toward FRAMING (idle/ambient) or PERFORM_ZOOM (perform).
  const figureHeightRef = useRef(FRAMING.figureHeight)
  const parallaxRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 })
  const finishedRef = useRef(false)
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  // Create the GL context and the scene renderer once.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    let renderer = null
    let ctx = null
    try {
      ctx = new ManagedWebGLRenderingContext(canvas, {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
      })
      ctxRef.current = ctx
      renderer = new SceneRenderer(canvas, ctx, true)
      runtimeRef.current = { ctx, renderer }
      setContext(ctx)
    } catch (err) {
      console.error('[SpineStage] WebGL init failed:', err)
    }
    return () => {
      if (renderer) renderer.dispose()
      // ManagedWebGLRenderingContext has no dispose method (verified in
      // spine-webgl 4.1.56) — its canvas listeners die with the canvas.
      ctxRef.current = null
      runtimeRef.current = null
      setContext(null)
    }
  }, [])

  // Switch spine tracks whenever the choreography state changes.
  useEffect(() => {
    if (!asset) return undefined
    const animName = ANIMS[state]
    if (!animName || !asset.data.findAnimation(animName)) return undefined
    asset.state.setAnimation(0, animName, state === 'idle')
    finishedRef.current = false
    return undefined
  }, [asset, state])

  // Pointer parallax: normalize to -1..1 around the screen center.
  useEffect(() => {
    const onMove = (event) => {
      const target = parallaxRef.current
      target.targetX = (event.clientX / window.innerWidth) * 2 - 1
      target.targetY = (event.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // The render loop.
  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime || !asset) return undefined
    const { ctx, renderer } = runtime
    const { skeleton, state: animState, stateData } = asset
    const gl = ctx.gl
    applyMixes(stateData)

    let rafId = 0
    let lastTime = performance.now()

    const resize = () => {
      const canvas = canvasRef.current
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(canvas.clientWidth * scale))
      const height = Math.max(1, Math.round(canvas.clientHeight * scale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
        renderer.camera.setViewport(width, height)
      }
    }
    resize()
    window.addEventListener('resize', resize)

    const frame = (time) => {
      rafId = requestAnimationFrame(frame)
      const dt = Math.min((time - lastTime) / 1000, 0.1)
      lastTime = time

      // Ease the camera push-in for the perform state.
      const targetFigureHeight =
        state === 'perform' ? PERFORM_ZOOM.figureHeight : FRAMING.figureHeight
      const ease = 1 - Math.exp(-PERFORM_ZOOM.ease * dt)
      figureHeightRef.current +=
        (targetFigureHeight - figureHeightRef.current) * ease

      // Ease parallax toward the pointer target.
      const par = parallaxRef.current
      const strength = parallax / 100
      const damp = 1 - Math.exp(-PARALLAX.damping * dt)
      par.x += (par.targetX - par.x) * damp
      par.y += (par.targetY - par.y) * damp

      animState.update(dt)
      animState.apply(skeleton)
      skeleton.updateWorldTransform(0)

      // Report non-looping track completion exactly once.
      const track = animState.getCurrent(0)
      if (track && !track.loop && track.isComplete() && !finishedRef.current) {
        finishedRef.current = true
        if (onFinishedRef.current) onFinishedRef.current()
      }

      const canvas = canvasRef.current
      resize()
      const viewportW = canvas.width
      const viewportH = canvas.height

      const cam = renderer.camera
      const base = cameraFor(viewportW, viewportH, figureHeightRef.current)
      const zoom = base.zoom
      const offsetX = par.x * PARALLAX.maxOffsetX * viewportW * strength
      const offsetY = par.y * PARALLAX.maxOffsetY * viewportH * strength
      cam.zoom = zoom
      cam.position.set(base.x + offsetX, base.y + offsetY, 0)
      cam.update()

      // The backdrop is a CSS layer behind the canvas, so clear transparent.
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      // BD2 atlases are NOT premultiplied — passing `true` paints a white slab
      // over any large translucent overlap. Both values were verified; this
      // must stay `false`.
      renderer.begin()
      renderer.drawSkeleton(skeleton, false)
      renderer.end()
    }

    if (paused) {
      // Keep the last presented frame; the canvas retains it until the loop
      // resumes. Textures and the GL context stay alive so resume is instant.
    } else {
      rafId = requestAnimationFrame((t) => {
        lastTime = t
        frame(t)
      })
    }

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [asset, state, paused, parallax])

  if (error) {
    return (
      <div className="bd2-stage-error" role="alert">
        模型加载失败：{error.message}
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className="bd2-stage"
      aria-label="Spine 舞台"
      onClick={() => {
        if (onClickRef.current) onClickRef.current()
      }}
    />
  )
}
