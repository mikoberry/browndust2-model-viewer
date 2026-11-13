// Root route ('/'): a full-viewport wallpaper with ONE fixed model over its
// matching backdrop, with a fixed composition.
//
// Geometry: `design` is a fixed virtual canvas (by default the backdrop's
// native pixel size). The backdrop <img> and the WebGL canvas are BOTH children
// of that canvas, so they share one CSS transform. Only that single transform
// reacts to screen size / aspect ratio; everything inside is resolution
// independent. No UI is rendered except a plain text line on failure.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { models } from 'virtual:model-library'
import SpineStage from '../spine/SpineStage.jsx'
import { pickDefaultAnimation, pickDefaultExpression } from '../lib/animation.js'
import { assetUrl } from '../lib/assets.js'
import {
  WALLPAPER,
  resolveWallpaperModel,
  pickBackdrop,
  resolveDesign,
  designScale,
  resolveLayerTransform,
} from '../config/wallpaper.js'

const readViewport = () => ({ width: window.innerWidth, height: window.innerHeight })

export default function WallpaperPage() {
  const model = useMemo(() => {
    const override = new URLSearchParams(window.location.search).get('model') ?? ''
    return resolveWallpaperModel(models, override)
  }, [])
  const backdrop = useMemo(() => pickBackdrop(model), [model])
  const design = useMemo(() => resolveDesign(backdrop), [backdrop])
  const backdropUrl = useMemo(() => (backdrop ? assetUrl(backdrop.url) : ''), [backdrop])
  // Both adjustments resolve to design-canvas pixels, so the numbers below are
  // independent of the screen. The backdrop uses a CSS transform; the model
  // applies the SAME tuple inside the WebGL camera (see SpineStage).
  const backdropT = useMemo(
    () => resolveLayerTransform(WALLPAPER.backdropTransform, design),
    [design],
  )
  const modelT = useMemo(() => resolveLayerTransform(WALLPAPER.modelTransform, design), [design])
  const stageDesign = useMemo(
    () => ({ ...design, model: WALLPAPER.model, transform: modelT }),
    [design, modelT],
  )

  const [viewport, setViewport] = useState(readViewport)
  useEffect(() => {
    const onResize = () => setViewport(readViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const scale = designScale(design, viewport, WALLPAPER.fit)
  const left = (viewport.width - design.width * scale) / 2
  const top = (viewport.height - design.height * scale) / 2

  const [info, setInfo] = useState(null)
  const [animation, setAnimation] = useState('')
  const [expression, setExpression] = useState('')
  const [message, setMessage] = useState('')

  const handleLoaded = useCallback(
    (next) => {
      if (!model || next.modelId !== model.id) return
      // infoReady stops SpineStage from re-reporting on every render.
      setInfo(next)
      setAnimation(WALLPAPER.animation ?? pickDefaultAnimation(next.animations))
      setExpression(WALLPAPER.expression ?? pickDefaultExpression(next.animations))
      setMessage('')
    },
    [model],
  )

  const handleError = useCallback((err) => {
    const text = err instanceof Error ? err.message : String(err)
    console.error('[wallpaper]', text)
    setMessage(text)
  }, [])

  return (
    <div className="wallpaper-page" style={{ backgroundColor: WALLPAPER.letterbox }}>
      {WALLPAPER.bleed && backdropUrl && (
        <div
          className="wallpaper-bleed"
          style={{ backgroundImage: `url("${backdropUrl}")` }}
          aria-hidden="true"
        />
      )}

      <div
        className="wallpaper-design"
        style={{
          width: design.width,
          height: design.height,
          left,
          top,
          transform: `scale(${scale})`,
        }}
      >
        {backdropUrl && (
          <img
            className="wallpaper-backdrop"
            src={backdropUrl}
            alt=""
            draggable="false"
            style={{
              transform: `translate(${backdropT.dx}px, ${backdropT.dy}px) scale(${backdropT.scale})`,
            }}
          />
        )}
        {model && (
          <SpineStage
            model={model}
            animation={animation}
            expression={expression}
            skin={WALLPAPER.skin}
            playing
            speed={WALLPAPER.speed}
            loop
            zoom={WALLPAPER.zoom}
            showBones={false}
            showBounds={false}
            infoReady={Boolean(info)}
            fitToken={0}
            resetToken={0}
            interactive={false}
            showLoading={false}
            design={stageDesign}
            onLoaded={handleLoaded}
            onError={handleError}
          />
        )}
      </div>

      {message && <p className="wallpaper-message">{message}</p>}
      {!model && <p className="wallpaper-message">model-library/ 里没有可识别的模型</p>}
    </div>
  )
}
