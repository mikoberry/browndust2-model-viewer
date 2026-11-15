// Dev-only Wallpaper Engine audio simulator.
//
// In a plain browser there is no WE host, so `wallpaperRegisterAudioListener`
// never exists and `window.__wallkitAudioFrame` stays null — the spectrum and
// beat widgets sit still. This module stands in for the host: it plays
// public/spitz.mp3 through a Web Audio graph (channel splitter → two
// analysers) and writes the same 256-float frame shape the real bridge does
// (left 128 bins, right 128 bins, 0..1) into that global every rAF.
//
// It yields to the real host: the WE bridge stamps `__wallkitAudioAt` on every
// callback, so while fresh host frames are arriving the simulator stops
// writing — plugging the wallpaper into WE takes over automatically.
//
// Enabled only in dev builds with `?audioSim=1`; production/embed builds never
// even import this path past the guard in WallpaperPage.

import { assetUrl } from '../../lib/assets.js'

// The real bridge copies whole frames; a fresh identity means a fresh frame.
function writeFrame(left, right) {
  const frame = new Float32Array(256)
  for (let i = 0; i < 128; i += 1) {
    frame[i] = left[i] / 255
    frame[i + 128] = right[i] / 255
  }
  window.__wallkitAudioFrame = frame
}

// The album card does not read audio frames — it reads `__wallkitMedia`
// (title / artist / thumbnail / playback), which WE's media listener pushes.
// The sim fabricates a small canvas-drawn cover so no external image is needed.
function makeCover() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 512, 512)
  gradient.addColorStop(0, '#5b6ee1')
  gradient.addColorStop(1, '#2a1a4a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 512, 512)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.font = 'bold 260px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('♪', 256, 276)
  return canvas.toDataURL('image/png')
}

// The media hook polls this object at 2 Hz, so it is written once and mutated
// in place on play/pause — no per-frame churn.
function writeMedia(playback, thumbnail) {
  window.__wallkitMedia = {
    title: 'Spitz',
    artist: 'Audio Sim',
    albumTitle: '',
    thumbnail,
    primaryColor: '#5b6ee1',
    textColor: '#ffffff',
    playback,
  }
}

export function startAudioSim() {
  const audio = new Audio(assetUrl('spitz.mp3'))
  audio.loop = true
  audio.crossOrigin = 'anonymous'

  const context = new AudioContext()
  const source = context.createMediaElementSource(audio)
  const splitter = context.createChannelSplitter(2)
  const analyserL = context.createAnalyser()
  const analyserR = context.createAnalyser()
  analyserL.fftSize = 256
  analyserR.fftSize = 256
  source.connect(splitter)
  splitter.connect(analyserL, 0)
  splitter.connect(analyserR, 1)
  source.connect(context.destination)

  const left = new Uint8Array(128)
  const right = new Uint8Array(128)
  let rafId = 0
  let stopped = false

  const thumbnail = makeCover()
  writeMedia(audio.paused ? 'paused' : 'playing', thumbnail)
  audio.addEventListener('play', () => writeMedia('playing', thumbnail))
  audio.addEventListener('pause', () => writeMedia('paused', thumbnail))

  function pump() {
    if (stopped) return
    // Fresh host frames win; step aside until the host goes quiet again.
    const hostActive = window.__wallkitAudioAt && Date.now() - window.__wallkitAudioAt < 500
    if (!hostActive) {
      analyserL.getByteFrequencyData(left)
      analyserR.getByteFrequencyData(right)
      writeFrame(left, right)
    }
    rafId = requestAnimationFrame(pump)
  }
  rafId = requestAnimationFrame(pump)

  function stop() {
    stopped = true
    if (rafId) cancelAnimationFrame(rafId)
    audio.pause()
    audio.src = ''
    context.close()
    delete window.__wallkitMedia
  }

  function play() {
    if (context.state === 'suspended') context.resume()
    return audio.play()
  }

  return { audio, play, stop }
}
