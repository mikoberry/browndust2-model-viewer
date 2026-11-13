// Overlay: the wallkit control layer. It receives plain props and owns no
// data — time, audio bars, beat and pause all arrive from App, and it knows
// nothing about the spine stage behind it.

import { Clock } from 'wallkit/components/clock'
import { Spectrum } from 'wallkit/components/spectrum'

// Accent tuned to the carpet crest's deep gold. The scene is bright, so the
// clock uses the dark (dark text) theme.
const ACCENT = '#8a7042'

export default function Overlay({ now, bars, beat, paused, userProps }) {
  return (
    <div className="bd2-overlay" aria-hidden={paused}>
      <Clock
        now={now}
        visible={userProps.clockStyle !== 'none'}
        placement={userProps.clockStyle === 'minimal' ? 'minimal' : userProps.clockStyle}
        theme="dark"
        anchor="top-right"
        offsetX={5}
        offsetY={6}
        beat={beat}
        tilt={{ maxTilt: 5, speed: 8 }}
      />
      <Spectrum
        bars={bars}
        visible={userProps.spectrumStyle !== 'none'}
        variant={userProps.spectrumStyle}
        colorHex={ACCENT}
        anchor="bottom-left"
        offsetX={5}
        offsetY={4}
        size={84}
        paused={paused}
      />
    </div>
  )
}
