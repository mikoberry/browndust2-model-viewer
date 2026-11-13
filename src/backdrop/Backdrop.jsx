// Backdrop: the throne-hall scene as a CSS <img> layer behind the canvas.
// Static image, `object-fit: cover`, no WebGL — it costs no texture units and
// never enters the render loop. A vignette and a whisper of grain mask the
// upscale softness and give the flat scene some depth.

import { BACKDROP } from '../stage/stageConfig.js'

export default function Backdrop({ dim }) {
  return (
    <div className="bd2-backdrop" aria-hidden="true">
      <img
        className="bd2-backdrop__image"
        src={BACKDROP.src}
        alt=""
        draggable="false"
        style={{ filter: `brightness(${dim})` }}
      />
      <div className="bd2-backdrop__vignette" />
      <div className="bd2-backdrop__grain" />
    </div>
  )
}
