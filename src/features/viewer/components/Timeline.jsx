import { useState } from 'react'

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0.00'
  return Math.max(0, seconds).toFixed(2)
}

export default function Timeline({ progress, onSeek, disabled }) {
  const [scrubbing, setScrubbing] = useState(false)
  const [scrubValue, setScrubValue] = useState(0)
  const percent = scrubbing ? scrubValue : progress.percent

  const handleChange = (event) => {
    const value = Number(event.target.value) / 1000
    setScrubValue(value)
    onSeek(value)
  }

  return (
    <div className="timeline">
      <span className="timeline-time">{formatTime(progress.time)}s</span>
      <input
        className="timeline-range"
        type="range"
        min="0"
        max="1000"
        step="1"
        value={Math.round(percent * 1000)}
        disabled={disabled}
        aria-label="动画进度"
        onChange={handleChange}
        onPointerDown={() => {
          setScrubbing(true)
          setScrubValue(progress.percent)
        }}
        onPointerUp={() => setScrubbing(false)}
        onPointerCancel={() => setScrubbing(false)}
        onBlur={() => setScrubbing(false)}
      />
      <span className="timeline-time">{formatTime(progress.duration)}s</span>
      <span className="timeline-percent">{Math.round(percent * 100)}%</span>
    </div>
  )
}
