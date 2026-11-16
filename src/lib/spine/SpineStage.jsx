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
    // Seconds to skip at the head of the looping `animation` (track 0 only).
    // Some BD2 idle loops bake the character's slide-in into their first frames;
    // trimming starts past it. The runtime loops [animationStart, animationEnd)
    // and `setAnimation` resets trackTime to 0, so a fresh entry simply begins
    // at the trim point. Sequence clips play as authored — only `animation`.
    animationStart = 0,
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
    // { scale, dx, dy } in DESIGN pixels, resolved by lib/composition.js.
    // `transformRef` (optional) overrides it on every frame without a re-render:
    // the wallpaper's entrance cross-fade writes there while it eases from the
    // cutscene framing into the composed one.
    design = null,
    // Entrance sequence on track 0: an ordered list of animation names played
    // back to back, the LAST one looping (e.g. ['cut_A','cut_B','loop_2']).
    // `sequenceToken` re-runs it from the start without reloading the asset.
    // Unknown names are dropped, and an empty / missing list means "just play
    // ``animation`", i.e. the debug viewer's behaviour. `onSequenceDone` fires
    // once when the last clip becomes the current one. `onSequenceStage` fires
    // every time a DIFFERENT clip takes over (including the first), so a caller
    // can swap the framing per shot — it is one call per clip, not per frame.
    // `onSequenceFrame(name, elapsedSeconds)` fires EVERY frame while a
    // sequence runs (name = current clip, elapsed = seconds into it, from the
    // track's own clock so `speed` applies), and `(null, 0)` once when the
    // sequence hands track 0 back — the per-frame camera-move driver.
    sequence = null,
    sequenceToken = 0,
    onSequenceDone,
    onSequenceStage,
    onSequenceFrame,
    // Click-to-play: when `clickAnimation` is a non-empty animation name, the
    // wallpaper hands track 0 to it once on a click (via `onClick` -> parent
    // bumping `clickToken`). It plays through ONCE (loop=false) and then the
    // queued `animation` takes back over, so a click is a one-shot reaction
    // that returns to the idle loop. Empty / missing = no click behaviour.
    clickAnimation = '',
    clickToken = 0,
    onClick,
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

  // Track 0 owner: true while a sequence is running, so the single-animation
  // effects below do not fight it for the same track.
  const sequenceActiveRef = useRef(false)
  const sequenceKey = Array.isArray(sequence) ? sequence.join('|') : ''
  // Last entry of the running sequence + whether we still have to announce it.
  // The render loop watches for that entry becoming the current one.
  const sequenceTailRef = useRef('')
  const sequencePendingRef = useRef(false)
  // Last clip announced through `onSequenceStage`. The loop compares against the
  // live track entry, so a caller gets exactly one call per shot.
  const sequenceStageRef = useRef('')

  // Clamp `animationStart` onto a track-0 entry. The spine runtime computes a
  // looping entry's pose time as `trackTime % (end - start) + start`, so once
  // `animationStart` is set the entry plays and loops past the trimmed head.
  const applyAnimationStart = (entry) => {
    if (!entry) return
    const raw = Number(liveRef.current.animationStart) || 0
    const duration = entry.animation?.duration ?? 0
    const start = raw > 0 && duration > raw ? raw : 0
    if (entry.animationStart !== start || entry.animationEnd !== duration) {
      entry.animationStart = start
      entry.animationEnd = duration
    }
  }

  // Track 0: the selected body animation. Skipped while a sequence owns the
  // track — the sequence effect below has already queued what should play.
  useEffect(() => {
    if (!asset || sequenceActiveRef.current) return
    if (!animation || !asset.data.findAnimation(animation)) return
    asset.state.setAnimation(0, animation, liveRef.current.loop)
    applyAnimationStart(asset.state.getCurrent(0))
    fitPendingRef.current = true
  }, [asset, animation])

  // The trim is edited live (composition panel / config reload): re-apply it to
  // the current entry and rewind, so what you see starts at the new trim point.
  useEffect(() => {
    if (!asset) return
    const entry = asset.state.getCurrent(0)
    if (!entry || sequenceActiveRef.current) return
    applyAnimationStart(entry)
    entry.trackTime = 0
  }, [asset, animationStart])

  // Track 0, sequence mode: every entry plays once and the LAST one loops.
  // `setAnimation` also drops anything still queued on track 0, so a replay
  // restarts cleanly; track 1 (`_faceN`) is untouched.
  const sequenceLengthRef = useRef(0)
  useEffect(() => {
    if (!asset) return
    const names = Array.isArray(sequence)
      ? sequence.filter((name) => typeof name === 'string' && name && asset.data.findAnimation(name))
      : []
    if (!names.length) {
      const wasSequence = sequenceActiveRef.current
      sequenceActiveRef.current = false
      sequencePendingRef.current = false
      sequenceStageRef.current = ''
      sequenceLengthRef.current = 0
      if (wasSequence) liveRef.current.onSequenceFrame?.(null, 0)
      if (!wasSequence) return
      // Sequence removed at runtime: fall back to the plain animation. When the
      // rAF handoff (sequence tail -> `animation`) already switched to it a
      // frame earlier, do NOT setAnimation again — that would restart the clip
      // at frame 0 with a visible jump.
      const fallback = liveRef.current.animation
      const current = asset.state.getCurrent(0)?.animation?.name ?? ''
      if (fallback && asset.data.findAnimation(fallback) && current !== fallback) {
        asset.state.setAnimation(0, fallback, liveRef.current.loop)
        applyAnimationStart(asset.state.getCurrent(0))
        fitPendingRef.current = true
      }
      return
    }
    sequenceActiveRef.current = true
    const last = names.length - 1
    sequenceLengthRef.current = names.length
    sequenceTailRef.current = names[last]
    sequencePendingRef.current = true
    sequenceStageRef.current = ''
    const { state } = asset
    // Only a MULTI-clip list is an entrance; a one-clip list means "loop this
    // clip" (the debug viewer's single-shot preview), so it must loop too.
    const tailLoops = liveRef.current.loop !== false
    state.setAnimation(0, names[0], last === 0 && tailLoops)
    for (let i = 1; i < names.length; i += 1) {
      state.addAnimation(0, names[i], i === last && tailLoops, 0)
    }
    fitPendingRef.current = true
  }, [asset, sequenceKey, sequenceToken])

  // Click-to-play on track 0: a one-shot reaction. `setAnimation(..., false)`
  // plays the clicked clip once, then the queued `animation` (track 0's resting
  // loop) takes back over with no gap. Skipped while a sequence owns the track,
  // so a click never interrupts the opening cutscene.
  //
  // Rapid clicks do NOT restart the playing one-shot: the first click plays,
  // further clicks while it runs are buffered (depth 1 — latest wins), and the
  // buffered one fires the moment the current play completes. A burst of clicks
  // therefore reads as back-to-back plays, never as a restart from frame 0.
  const clickPlayingRef = useRef(false)
  const clickPendingRef = useRef(false)

  // Latest-play indirection: both the clickToken effect below and the
  // completion listener (which must survive re-renders) play through this ref.
  const playClickRef = useRef(null)
  playClickRef.current = () => {
    if (!asset || !clickAnimation) return
    const { state } = asset
    const rest = liveRef.current.animation
    clickPlayingRef.current = true
    const entry = state.setAnimation(0, clickAnimation, false)
    entry.listener = {
      complete: () => {
        clickPlayingRef.current = false
        if (clickPendingRef.current) {
          clickPendingRef.current = false
          playClickRef.current?.()
        }
      },
      // Something else took track 0 over before the one-shot finished
      // (sequence start, animation switch, new model) — stop tracking.
      interrupt: () => {
        clickPlayingRef.current = false
        clickPendingRef.current = false
      },
    }
    if (rest && rest !== clickAnimation && asset.data.findAnimation(rest)) {
      // The queued resting loop inherits the trim, so it resumes past the
      // slide-in; the clicked one-shot plays as authored.
      const restEntry = state.addAnimation(0, rest, liveRef.current.loop !== false, 0)
      applyAnimationStart(restEntry)
    }
  }

  // A new model means a new AnimationState: both flags are stale.
  useEffect(() => {
    clickPlayingRef.current = false
    clickPendingRef.current = false
  }, [asset])

  useEffect(() => {
    if (!asset || !clickAnimation || clickToken <= 0) return
    if (sequenceActiveRef.current) return
    if (!asset.data.findAnimation(clickAnimation)) return
    if (clickPlayingRef.current) {
      // One-shot in progress: buffer the click instead of restarting it.
      clickPendingRef.current = true
      return
    }
    playClickRef.current?.()
  }, [asset, clickAnimation, clickToken])

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
    // A sequence decides loop per entry; forcing `loop` here would make the
    // intro cut repeat forever.
    if (!asset || sequenceActiveRef.current) return
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
    let costSum = 0

    const frame = (now) => {
      rafId = requestAnimationFrame(frame)
      // CPU cost of this callback: skeleton update plus the draw submission.
      // GPU work is asynchronous, so this is the number that says whether a
      // weak CPU can keep up — a vsync-locked 60 fps still burns this much.
      const costStart = performance.now()
      const live = liveRef.current
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now

      if (live.playing) state.update(dt * live.speed)
      state.apply(skeleton)
      skeleton.updateWorldTransform()

      // Entrance sequence: announce the hand-off to the last clip exactly once,
      // so the parent can ease from the cutscene framing into its own, and
      // announce every clip change so the framing can follow the shot. The
      // per-frame callback carries the clip's own clock for camera moves.
      if (sequenceActiveRef.current) {
        const head = state.getCurrent(0)
        const clip = head?.animation?.name ?? ''
        if (clip && clip !== sequenceStageRef.current) {
          sequenceStageRef.current = clip
          live.onSequenceStage?.(clip)
        }
        if (clip) live.onSequenceFrame?.(clip, head.trackTime ?? 0)
      }
      if (sequencePendingRef.current) {
        const head = state.getCurrent(0)
        if (head?.animation?.name === sequenceTailRef.current) {
          sequencePendingRef.current = false
          // The entrance is over. Hand track 0 back to the caller's own
          // `animation` so that setting finally means something again: before
          // this, the last clip owned the track forever and any `animation`
          // from the config was silently ignored.
          //   * same clip  -> keep the running entry, a `setAnimation` would
          //                   restart it at frame 0 and visibly jump;
          //   * other clip -> cross-fade over the default mix.
          // A ONE-clip list is not an entrance (the debug viewer's single-shot
          // preview), so it keeps looping that clip untouched.
          if (sequenceLengthRef.current > 1) {
            sequenceActiveRef.current = false
            live.onSequenceFrame?.(null, 0)
            const rest = live.animation
            if (rest && rest !== sequenceTailRef.current && state.data.skeletonData.findAnimation(rest)) {
              state.setAnimation(0, rest, live.loop !== false)
              applyAnimationStart(state.getCurrent(0))
              fitPendingRef.current = true
            }
          }
          live.onSequenceDone?.()
        }
      }

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
      const d = live.design
      const cssWidth = Math.max(canvas.clientWidth, 1)
      const cssHeight = Math.max(canvas.clientHeight, 1)
      // The wallpaper scales its fixed design canvas with a CSS transform, so
      // the canvas is displayed larger/smaller than its layout size. Render at
      // the real displayed size to keep it sharp on any screen; with no
      // transform displayScale is 1 and the debug viewer behaves as before.
      const rect = canvas.getBoundingClientRect()
      const displayScale = Math.max(rect.width / cssWidth, rect.height / cssHeight, 0.01)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      // The wallpaper may render on a surface `overscan` times larger than the
      // design canvas. Divide the density cap by it so the maximum bitmap size
      // (and so GPU memory) stays what the exact-canvas case used to allow.
      const surfaceOverscan = d?.overscan > 0 ? d.overscan : 1
      const renderScale = Math.min(dpr * displayScale, 3 / surfaceOverscan)
      const width = Math.max(1, Math.round(cssWidth * renderScale))
      const height = Math.max(1, Math.round(cssHeight * renderScale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
        renderer.camera.setViewport(width, height)
      }

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
        // The canvas bitmap covers a surface `overscan` times the design canvas,
        // so dividing by d.width alone would over-scale the camera. Either way
        // k === renderScale, so the composition maths is identical.
        const k = width / (d.width * surfaceOverscan)
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
        // A ref wins over the prop so a cross-fade can drive it per frame.
        const t = d.transformRef?.current ?? d.transform ?? {}
        const layerScale = t.scale > 0 ? t.scale : 1
        const offsetX = Number.isFinite(t.dx) ? t.dx : 0
        const offsetY = Number.isFinite(t.dy) ? t.dy : 0
        // Extra per-frame offset supplied by the parent (wallpaper mouse
        // parallax), also in design pixels. Read from a ref so the drift never
        // re-renders: the loop just picks up whatever is in there right now.
        const extra = d.offsetRef?.current
        const extraX = Number.isFinite(extra?.x) ? extra.x : 0
        const extraY = Number.isFinite(extra?.y) ? extra.y : 0
        worldZoom =
          Math.max(b.h / (d.height * hRatio * k), b.w / (d.width * wRatio * k)) /
          (Math.max(live.zoom, MIN_ZOOM) * layerScale)
        // Target of the model centre in design space (device px from centre).
        // World -> screen is px = (wx - camX) / worldZoom (Y is flipped), so
        // solving for the camera centre gives the two lines below.
        const targetX = ((alignX - 0.5) * d.width + offsetX + extraX) * k
        const targetY = ((alignY - 0.5) * d.height + offsetY + extraY) * k
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
      costSum += performance.now() - costStart
      if (now - fpsClock >= 500) {
        const stats = {
          fps: Math.round((frames * 1000) / (now - fpsClock)),
          // Average CPU milliseconds per frame over the same window.
          cpu: costSum / frames,
        }
        live.onStats?.(stats)
        // Read by the opt-in stats HUD (wallpaper feature). Two float writes per
        // 500 ms: cheap enough to leave unconditional, and it keeps this module
        // free of any dependency on the feature layer.
        if (typeof window !== 'undefined') window.__BD2_STAGE_STATS__ = stats
        frames = 0
        costSum = 0
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
        onClick={onClick}
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
