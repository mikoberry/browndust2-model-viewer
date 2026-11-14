// Opt-in performance readout for the wallpaper page.
//
// Off by default, because it must never show up for viewers. Switch it on from
// the settings drawer (Other tab) — that toggle writes the shared flag in
// `../statsFlag.js`, and the readout follows it live, no reload needed.
//
// It measures the things that actually decide whether a wallpaper feels smooth
// on a weak machine, not just "is it running":
//
//   FPS / p95 / worst   frame pacing of the main thread. `p95` is the number
//                       that matters — an average of 60 with a p95 of 40 ms
//                       still stutters.
//   long                frames over 25 ms in the last second (>1.5 frames at
//                       60 Hz, i.e. a visible hitch).
//   heap                used JS heap. The self-contained build parks ~36 MB of
//                       base64 there permanently; `performance.memory` needs
//                       --enable-precise-memory-info for byte precision but is
//                       good enough for MB-scale trends.
//   buf                 WebGL drawing buffer, i.e. the pixels actually shaded
//                       each frame. Fill rate is what kills integrated GPUs.
//   GPU                 the real renderer string (via WEBGL_debug_renderer_info),
//                       so a report can say "Intel UHD" instead of "slow".
//
// All inline styles: this must not depend on, or leak into, the wallpaper theme.

import { useEffect, useRef, useState } from 'react'
import { readStatsFlag, subscribeStatsFlag } from '../statsFlag.js'

const MB = 1024 * 1024

function readGl() {
  const canvas = document.querySelector('canvas')
  if (!canvas) return null
  // Explicitly requesting the same context type returns the existing context,
  // so this does not create a second GL pipeline.
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
  if (!gl) return null
  const debug = gl.getExtension('WEBGL_debug_renderer_info')
  return {
    gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    buffer: `${gl.drawingBufferWidth}×${gl.drawingBufferHeight}`,
  }
}

function readHeap() {
  const memory = performance.memory
  if (!memory) return null
  const used = memory.usedJSHeapSize / MB
  const limit = memory.jsHeapSizeLimit / MB
  // Chromium clamps the limit to ~4 GB and reports coarse buckets without
  // precise-memory-info, so show one decimal and no unit noise.
  return `${used.toFixed(1)} / ${limit.toFixed(0)} MB`
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
  return sorted[index]
}

export default function StatsHud() {
  const [enabled, setEnabled] = useState(readStatsFlag)

  // Live switch: the drawer toggle announces the change, so turning it on does
  // not require reloading the wallpaper.
  useEffect(() => subscribeStatsFlag(setEnabled), [])

  return enabled ? <Readout /> : null
}

function Readout() {
  const [snap, setSnap] = useState(() => ({ fps: 0, p95: 0, worst: 0, long: 0, heap: readHeap() }))
  const glRef = useRef(null)

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let lastReport = last
    // Frame deltas from roughly the last four seconds; the report walks them
    // backwards and keeps whichever fall inside the last second.
    const deltas = []

    const loop = (now) => {
      const delta = now - last
      last = now
      if (delta > 0 && delta < 5000) {
        deltas.push(delta)
        if (deltas.length > 400) deltas.shift()
      }

      if (now - lastReport >= 500) {
        lastReport = now
        // Only the deltas from the last second: a 4 s window would hide a
        // stutter that happens once every two seconds.
        const samples = []
        let span = 0
        for (let i = deltas.length - 1; i >= 0 && span < 1000; i -= 1) {
          samples.push(deltas[i])
          span += deltas[i]
        }
        const sorted = [...samples].sort((a, b) => a - b)
        glRef.current = glRef.current ?? readGl()
        setSnap({
          fps: span > 0 ? (samples.length * 1000) / span : 0,
          p95: percentile(sorted, 0.95),
          worst: sorted.length ? sorted[sorted.length - 1] : 0,
          long: samples.filter((value) => value > 25).length,
          // CPU milliseconds the stage spends per frame (skeleton update + draw
          // submission), reported by SpineStage. Meaningful even when vsync
          // pins the frame rate at 60.
          cpu: globalThis.__BD2_STAGE_STATS__?.cpu,
          heap: readHeap(),
          gl: glRef.current,
        })
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const line = {
    display: 'flex',
    gap: '0.9em',
    whiteSpace: 'pre',
  }
  const label = { opacity: 0.55, minWidth: '4.2em' }

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: 8,
        zIndex: 9999,
        padding: '6px 8px',
        borderRadius: 6,
        background: 'rgba(8, 8, 10, 0.62)',
        color: '#e9e9ec',
        font: '11px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace',
        letterSpacing: '0.01em',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div style={line}>
        <span style={label}>fps</span>
        <span>
          {snap.fps.toFixed(1)}  p95 {snap.p95.toFixed(1)}ms  worst {snap.worst.toFixed(0)}ms  long {snap.long}
        </span>
      </div>
      <div style={line}>
        <span style={label}>cpu</span>
        <span>
          {Number.isFinite(snap.cpu) ? `${snap.cpu.toFixed(2)}ms` : '–'}  (update + draw submit)
        </span>
      </div>
      <div style={line}>
        <span style={label}>heap</span>
        <span>{snap.heap ?? 'n/a (performance.memory hidden)'}</span>
      </div>
      <div style={line}>
        <span style={label}>buf</span>
        <span>
          {snap.gl?.buffer ?? 'no gl'}  dpr {window.devicePixelRatio.toFixed(2)}  {window.innerWidth}×
          {window.innerHeight}
        </span>
      </div>
      <div style={{ ...line, maxWidth: '72ch', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <span style={label}>gpu</span>
        <span>{snap.gl?.gpu ?? 'n/a'}</span>
      </div>
    </div>
  )
}
