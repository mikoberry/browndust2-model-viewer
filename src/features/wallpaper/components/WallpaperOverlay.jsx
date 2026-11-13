// WallKit control overlays for the wallpaper route: clock, audio spectrum,
// album card, ambient particles and pointer effects.
//
// WallKit is presentation-only: it renders from props and never touches the
// Spine stage. Everything therefore lives in its own absolutely positioned
// layer ABOVE the fixed design canvas, anchored to the VIEWPORT — so the
// widgets keep their screen position when the composition is scaled by `fit`.
//
// All of it is driven by the `overlay` section of wallpaper.config.json and
// every widget is opt-in: with all of them disabled the page stays a bare
// wallpaper (the library's layer still renders nothing).
//
// Data path: the Wallpaper Engine bridge (`wallkit/we`) that `wallkitWE()`
// injects into <head>. In a plain browser the bridge is absent, so the clock
// still ticks while the spectrum stays flat and the album card renders nothing
// — WallKit's documented "no data" behaviour. Nothing here invents data.
//
// Each data hook lives in the widget it belongs to, so a wallpaper with only a
// clock never subscribes to audio frames (and never re-renders at audio rate).

import { useEffect, useState } from 'react'
import 'wallkit/styles'
import { Clock } from 'wallkit/components/clock'
import { Spectrum } from 'wallkit/components/spectrum'
import { AlbumArt } from 'wallkit/components/album-art'
import { AmbientFx } from 'wallkit/components/ambient-fx'
import { PointerFx } from 'wallkit/components/pointer-fx'
import {
  useWallpaperAudio,
  useWallpaperBeat,
  useWallpaperMedia,
  useWallpaperPaused,
} from 'wallkit/we'
import { WALLPAPER } from '../config.js'
import { useLocale, localeTag, weekdayName } from '../../../lib/i18n.js'

// `Clock` deliberately owns no timer: the caller drives `now`. Ticking once a
// second is enough for a minute-resolution display, and stopping while the
// engine has the wallpaper paused is what pauses the clock (it has no `paused`
// prop of its own).
function useNow(paused) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (paused) return undefined
    // Resync immediately: after a pause the display may be hours behind.
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [paused])

  return now
}

// Isolated so the audio subscription (and its re-renders) only exists when
// `clock.beat` is on.
function BeatClock({ base, labels }) {
  const beat = useWallpaperBeat()
  return <Clock {...base} beat={beat} labels={labels} />
}

function ClockWidget({ spec, accent, paused }) {
  // Subscribe so the clock re-localizes (weekday / date format) when the user
  // switches language in the drawer.
  useLocale()
  const now = useNow(paused)
  const base = {
    now,
    placement: spec.placement,
    color: spec.color || accent || undefined,
    size: spec.size,
    use24Hour: spec.use24Hour,
    anchor: spec.anchor,
    offsetX: spec.offsetX,
    offsetY: spec.offsetY,
    tilt: spec.tilt,
  }
  // Localize the clock's date/weekday text. `locale` drives Intl formatting
  // (month name, AM/PM), while `weekday` supplies the weekday word WallKit
  // does not translate itself. Caller-supplied `spec.labels` still wins for
  // the `aria` name.
  const labels = {
    ...(spec.labels ?? {}),
    locale: localeTag(),
    weekday: weekdayName(now),
  }
  return spec.beat ? <BeatClock base={base} labels={labels} /> : <Clock {...base} labels={labels} />
}

// `useWallpaperAudio()` hands back one stable, in-place rewritten buffer, which
// `Spectrum` reads inside its own draw loop: 60 Hz audio costs no re-renders
// here. Passing it through state or cloning it would freeze the graph.
//
// `colorHex` is resolved here instead of leaving an empty string for WallKit to
// fill from `--wallkit-accent`: WallKit reads that token once on mount and never
// re-reads it, so an accent change while the widget "follows the theme colour"
// (empty `color`) would never repaint. Falling back to `accent` keeps the
// widget live under the shared theme swatch.
//
// Sizing follows WallKit's two mutually-exclusive models: `size` scales the base
// box (the default control), while an explicit `width`/`height` override it —
// e.g. `width="100vw" height="14vh"` spans the bottom edge, and a radial style
// uses `width="46vh" height="46vh"` for a fixed circular diameter. We pass the
// configured values through untouched; `''` simply means "let `size` decide".
function SpectrumWidget({ spec, accent, paused }) {
  const bars = useWallpaperAudio()
  return (
    <Spectrum
      bars={bars}
      variant={spec.variant}
      colorHex={spec.color || accent || undefined}
      size={spec.size}
      width={spec.width || undefined}
      height={spec.height || undefined}
      anchor={spec.anchor}
      offsetX={spec.offsetX}
      offsetY={spec.offsetY}
      intensity={spec.intensity}
      curve={spec.curve}
      paused={paused}
    />
  )
}

function AlbumWidget({ spec, accent, paused }) {
  const track = useWallpaperMedia(paused)
  const bars = useWallpaperAudio()
  return (
    <AlbumArt
      track={track}
      bars={bars}
      variant={spec.variant}
      color={spec.textColor || accent || undefined}
      colorHex={spec.color || accent || undefined}
      size={spec.size}
      anchor={spec.anchor}
      offsetX={spec.offsetX}
      offsetY={spec.offsetY}
      paused={paused}
      labels={spec.labels ?? {}}
    />
  )
}

export default function WallpaperOverlay({ config }) {
  const overlay = config ?? WALLPAPER.overlay
  const paused = useWallpaperPaused()
  const { accent, clock, spectrum, albumArt, ambient, pointer } = overlay

  const anyEnabled = [clock, spectrum, albumArt, ambient, pointer].some((item) => item?.enabled)
  if (!anyEnabled) return null

  return (
    <div
      className="wallpaper-overlay"
      // WallKit reads its accent from the theme tokens; scoping the override to
      // this layer keeps the debug viewer untouched.
      style={accent ? { '--wallkit-accent': accent } : undefined}
    >
      {ambient?.enabled && (
        <AmbientFx
          variant={ambient.variant}
          colorHex={ambient.color || undefined}
          density={ambient.density}
          size={ambient.size}
          intensity={ambient.intensity}
          paused={paused}
        />
      )}
      {pointer?.enabled && (
        <PointerFx
          trail={pointer.trail}
          click={pointer.click}
          trailVariant={pointer.trailVariant}
          clickVariant={pointer.clickVariant}
          colorHex={pointer.color || undefined}
          size={pointer.size}
          intensity={pointer.intensity}
          paused={paused}
        />
      )}
      {spectrum?.enabled && <SpectrumWidget spec={spectrum} accent={accent} paused={paused} />}
      {albumArt?.enabled && <AlbumWidget spec={albumArt} accent={accent} paused={paused} />}
      {clock?.enabled && <ClockWidget spec={clock} accent={accent} paused={paused} />}
    </div>
  )
}
