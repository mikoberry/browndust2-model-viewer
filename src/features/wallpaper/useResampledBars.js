// Folds WallKit's live audio frame down to `count` spectrum columns.
//
// WallKit's contract is caller-side folding: `<Spectrum>` draws one column per
// entry in `bars`, and its README says to run `resampleBars(bars, count)` first
// (`<MiniSpectrum barCount>` is the card-sized exception, not a floating widget
// prop). The catch is that the buffer returned by `useWallpaperAudio()` is
// rewritten IN PLACE at audio rate, so folding it once during render would keep
// drawing the first frame forever. The fold therefore runs in its own rAF loop
// into a stable output buffer: 128 reads plus `count` writes per frame, and the
// canvas keeps reading the same object (no loop teardown, no re-render).
//
// `count` equal to the source length (the default 128) short-circuits and hands
// the source buffer straight back, so the common case costs no loop at all.

import { useEffect, useState } from 'react'
import { resampleBars } from 'wallkit/core'

/**
 * @param {Float32Array|number[]|null} bars  Live frame from `useWallpaperAudio`.
 * @param {number} count  Desired column count (8..source length).
 * @param {boolean} [paused=false]  Skip the fold loop while the engine is paused.
 * @returns {Float32Array|number[]|null} A stable buffer of `count` bars.
 */
export function useResampledBars(bars, count, paused = false) {
  const sourceLength = bars?.length ?? 0
  const target = Math.floor(Number(count) || 0)
  // Never upsample: repeating buckets would turn a folded view back into
  // visible banding, and 128 is the widest faithful drawing anyway.
  const fold = sourceLength > 1 && target > 1 && target < sourceLength

  const [folded, setFolded] = useState(null)

  useEffect(() => {
    if (!fold) {
      setFolded(null)
      return undefined
    }
    const out = new Float32Array(target)
    resampleBars(bars, target, out)
    setFolded(out)
    // Paused: keep the last written frame on screen and stop burning a frame
    // budget on data nobody draws (the canvas loop is cancelled too).
    if (paused) return undefined

    let frame = 0
    const tick = () => {
      resampleBars(bars, target, out)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [bars, target, fold, paused])

  return fold ? folded : bars
}
