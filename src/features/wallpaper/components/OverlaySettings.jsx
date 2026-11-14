// Per-widget settings panels for the WallKit control overlays. One panel per
// drawer tab; every panel edits the live `overlay` object held by
// WallpaperPage, so changes apply to the wallpaper immediately and are only
// persisted by the drawer's "copy config" exit.
//
// Option lists come from wallkit itself wherever it exports them, so a new
// variant in the library shows up here without a second source of truth.

import { Group, AnchorPicker, ChipField, ColorField, SliderField, ToggleField } from './settings-fields.jsx'
import { AMBIENT_SPEED_MIN, AMBIENT_SPEED_MAX } from 'wallkit/components/ambient-fx'
import { t } from '../../../lib/i18n.js'

// Option lists are rendered as button chips (never a <select>), so labels are
// kept short; the library's own identifier is in the button's `title`/tooltip.
// Not exported by wallkit (only documented in the component's JSDoc).
// Labels are resolved through t() at render time, so switching the locale
// retranslates the chips; the values stay the library's identifiers.
const CLOCK_PLACEMENTS = [
  { value: 'card', label: () => t('clock.card') },
  { value: 'bar', label: () => t('clock.bar') },
  { value: 'minimal', label: () => t('clock.minimal') },
  { value: 'cyberpunk', label: () => t('clock.cyberpunk') },
  { value: 'infobar', label: () => t('clock.infobar') },
  { value: 'split', label: () => t('clock.split') },
  { value: 'poster', label: () => t('clock.poster') },
  { value: 'ring', label: () => t('clock.ring') },
  { value: 'segments', label: () => t('clock.segments') },
  { value: 'stamp', label: () => t('clock.stamp') },
]

const SPECTRUM_VARIANTS = [
  { value: 'bars', label: () => t('spectrum.bars') },
  { value: 'mirror', label: () => t('spectrum.mirror') },
  { value: 'curve', label: () => t('spectrum.curve') },
  { value: 'pill', label: () => t('spectrum.pill') },
  { value: 'ring', label: () => t('spectrum.ring') },
  { value: 'ringwave', label: () => t('spectrum.ringwave') },
  { value: 'dots', label: () => t('spectrum.dots') },
  { value: 'ripples', label: () => t('spectrum.ripples') },
  { value: 'aurora', label: () => t('spectrum.aurora') },
]

// Radial styles take their diameter from the SHORTER side of the box (they
// force a square in CSS), so the panel only adds a hint that width == height
// keeps them circular.
const SPECTRUM_RADIAL = ['ring', 'ringwave', 'ripples', 'aurora']

// Default box per variant, following wallkit's own playground (layout.jsx):
// linear styles fill the bottom edge, radial styles keep a square so their
// circle is not squashed. Values are plain numbers: width is in `vw`, height is
// in `vh` (so 100 == full width / full height). Switching a style fills these in
// so the width/height sliders always show a concrete number.
const SPECTRUM_DIMENSIONS = {
  bars: { width: 100, height: 14 },
  mirror: { width: 100, height: 14 },
  curve: { width: 100, height: 14 },
  pill: { width: 100, height: 14 },
  dots: { width: 100, height: 14 },
  ring: { width: 46, height: 46 },
  ringwave: { width: 46, height: 46 },
  ripples: { width: 46, height: 46 },
  aurora: { width: 46, height: 46 },
}

// Parse a stored length back into the slider's number for the given unit. The
// panel only ever writes `vw` for width and `vh` for height, so any other value
// (a legacy unit, or an empty string) falls back to 0 rather than breaking the
// slider.
const lenOf = (value, unit) => {
  const re = new RegExp(`^(-?\\d+(?:\\.\\d+)?)${unit}$`, 'i')
  const match = re.exec(String(value ?? '').trim())
  return match ? Number(match[1]) : 0
}

const ALBUM_VARIANTS = [
  { value: 'classic', label: () => t('album.classic') },
  { value: 'glass', label: () => t('album.glass') },
  { value: 'vinyl', label: () => t('album.vinyl') },
  { value: 'minimal', label: () => t('album.minimal') },
  { value: 'bar', label: () => t('album.bar') },
  { value: 'wall', label: () => t('album.wall') },
]

const AMBIENT_VARIANTS = [
  { value: 'snow', label: () => t('ambient.snow') },
  { value: 'sakura', label: () => t('ambient.sakura') },
  { value: 'bubble', label: () => t('ambient.bubble') },
  { value: 'steam', label: () => t('ambient.steam') },
  { value: 'rain', label: () => t('ambient.rain') },
  { value: 'fog', label: () => t('ambient.fog') },
  { value: 'leaves', label: () => t('ambient.leaves') },
]

// Each variant's INNATE colour in wallkit (bubble has none — it follows the
// accent). Shown as the colour field's fallback so the swatch always matches
// what an empty `color` actually renders.
const AMBIENT_FIXED_COLORS = {
  snow: '#dbe9ff',
  sakura: '#f5b8cd',
  steam: '#eef1f4',
  rain: '#a8c0dc',
  fog: '#dfe6ee',
  leaves: '#d98a4f',
}

const POINTER_TRAIL_VARIANTS = [
  { value: 'glow', label: () => t('pointer.glow') },
  { value: 'ribbon', label: () => t('pointer.ribbon') },
  { value: 'bubble', label: () => t('pointer.bubble') },
  { value: 'firework', label: () => t('pointer.firework') },
]

const POINTER_CLICK_VARIANTS = [
  { value: 'ripple', label: () => t('pointer.ripple') },
  { value: 'sparks', label: () => t('pointer.sparks') },
  { value: 'bubble', label: () => t('pointer.bubble') },
  { value: 'firework', label: () => t('pointer.firework') },
]

// Offsets are viewport percentages in this drawer. A config file may hold a CSS
// length instead; the panel then shows 0 and says so rather than silently
// rounding it into a different unit.
const asNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const isNumeric = (value) => typeof value === 'number' && Number.isFinite(value)

// A slider drags within +/- one full viewport. A config value beyond that widens
// the track instead of clamping the handle to the edge, so the number box and the
// slider never disagree.
const OFFSET_SPAN = 100
const offsetRange = (value) => {
  const span = Math.max(OFFSET_SPAN, Math.ceil(Math.abs(value)))
  return [-span, span]
}

function PlacementFields({ spec, onChange }) {
  const irregular = !isNumeric(spec.offsetX) || !isNumeric(spec.offsetY)
  const offsetX = asNumber(spec.offsetX)
  const offsetY = asNumber(spec.offsetY)
  const [xMin, xMax] = offsetRange(offsetX)
  const [yMin, yMax] = offsetRange(offsetY)
  return (
    <>
      {/* The anchor grid spans both rows, so the two sliders get the full column
          width instead of being squeezed next to it. */}
      <div className="ws-pair is-position">
        <AnchorPicker value={spec.anchor} onChange={(anchor) => onChange({ anchor })} />
        <SliderField
          label={t('comp.offsetX')}
          value={offsetX}
          min={xMin}
          max={xMax}
          step={0.5}
          suffix=" %"
          onChange={(value) => onChange({ offsetX: value })}
        />
        <SliderField
          label={t('comp.offsetY')}
          value={offsetY}
          min={yMin}
          max={yMax}
          step={0.5}
          suffix=" %"
          onChange={(value) => onChange({ offsetY: value })}
        />
      </div>
      {irregular && (
        <p className="ws-note">
          {t('pointer.offsetNote')}
        </p>
      )}
    </>
  )
}

function ClockPanel({ spec, accent, onChange, onReset }) {
  return (
    <>
      <Group title={t('widget.show')} onReset={onReset}>
        <ToggleField label={t('clock.enable')} checked={spec.enabled} onChange={(enabled) => onChange({ enabled })} />
      </Group>
      <Group title={t('widget.appearance')}>
        <ChipField
          label={t('widget.layout')}
          value={spec.placement}
          options={CLOCK_PLACEMENTS}
          onChange={(placement) => onChange({ placement })}
        />
        <SliderField
          label={t('widget.size')}
          value={spec.size}
          min={40}
          max={200}
          step={1}
          suffix="%"
          onChange={(size) => onChange({ size })}
        />
        <ColorField
          label={t('widget.textColor')}
          value={spec.color ?? ''}
          fallback={accent}
          onChange={(color) => onChange({ color })}
        />
      </Group>
      <Group title={t('widget.position')} note={t('clock.anchorNote')}>
        <PlacementFields spec={spec} onChange={onChange} />
      </Group>
      <Group title={t('widget.interaction')}>
        <ToggleField
          label={t('clock.tilt')}
          note={t('clock.tiltNote')}
          checked={Boolean(spec.tilt)}
          onChange={(tilt) => onChange({ tilt })}
        />
        <ToggleField
          label={t('clock.beat')}
          note={t('clock.beatNote')}
          checked={Boolean(spec.beat)}
          onChange={(beat) => onChange({ beat })}
        />
        {spec.beat && (
          <div className="ws-pair">
            <SliderField
              label={t('clock.beatStrength')}
              value={spec.beatIntensity ?? 100}
              min={0}
              max={1000}
              step={1}
              onChange={(beatIntensity) => onChange({ beatIntensity })}
            />
            <SliderField
              label={t('clock.beatCurve')}
              value={spec.beatCurve ?? 0.62}
              min={0.2}
              max={2}
              step={0.01}
              onChange={(beatCurve) => onChange({ beatCurve })}
            />
          </div>
        )}
      </Group>
    </>
  )
}

function SpectrumPanel({ spec, accent, onChange, onReset }) {
  const radial = SPECTRUM_RADIAL.includes(spec.variant)
  return (
    <>
      <Group title={t('widget.show')} onReset={onReset}>
        <ToggleField
          label={t('spectrum.enable')}
          note={t('spectrum.enableNote')}
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      <Group title={t('widget.appearance')}>
        <ChipField
          label={t('widget.style')}
          value={spec.variant}
          options={SPECTRUM_VARIANTS}
          onChange={(variant) => {
            const dims = SPECTRUM_DIMENSIONS[variant]
            onChange(
              dims
                ? { variant, width: `${dims.width}vw`, height: `${dims.height}vh` }
                : { variant }
            )
          }}
        />
        <div className="ws-pair">
          <ColorField
            label={t('widget.color')}
            value={spec.color ?? ''}
            fallback={accent}
            onChange={(color) => onChange({ color })}
          />
          <SliderField
            label={t('widget.size')}
            value={spec.size}
            min={20}
            max={500}
            step={1}
            suffix="%"
            onChange={(size) => onChange({ size })}
          />
        </div>
        <div className="ws-pair">
          <SliderField
            label={t('widget.width')}
            value={lenOf(spec.width, 'vw')}
            min={0}
            max={100}
            step={1}
            onChange={(width) => onChange({ width: `${width}vw` })}
          />
          <SliderField
            label={t('widget.height')}
            value={lenOf(spec.height, 'vh')}
            min={0}
            max={100}
            step={1}
            onChange={(height) => onChange({ height: `${height}vh` })}
          />
        </div>
        {radial ? (
          <p className="ws-note">{t('spectrum.radialNote')}</p>
        ) : (
          <p className="ws-note">{t('spectrum.linearNote')}</p>
        )}
      </Group>
      <Group title={t('widget.position')}>
        <PlacementFields spec={spec} onChange={onChange} />
      </Group>
      <Group title={t('widget.response')}>
        <div className="ws-pair">
          <SliderField
            label={t('widget.intensity')}
            value={spec.intensity}
            min={0}
            max={1000}
            step={1}
            onChange={(intensity) => onChange({ intensity })}
          />
          <SliderField
            label={t('widget.curve')}
            value={spec.curve}
            min={0.2}
            max={2}
            step={0.01}
            onChange={(curve) => onChange({ curve })}
          />
        </div>
      </Group>
    </>
  )
}

function AlbumPanel({ spec, accent, onChange, onReset }) {
  return (
    <>
      <Group title={t('widget.show')} onReset={onReset}>
        <ToggleField
          label={t('album.enable')}
          note={t('album.enableNote')}
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      <Group title={t('widget.appearance')}>
        <ChipField
          label={t('widget.layout')}
          value={spec.variant}
          options={ALBUM_VARIANTS}
          onChange={(variant) => onChange({ variant })}
        />
        <SliderField
          label={t('widget.size')}
          value={spec.size}
          min={20}
          max={300}
          step={1}
          suffix="%"
          onChange={(size) => onChange({ size })}
        />
        <ColorField
          label={t('widget.textColor')}
          value={spec.textColor ?? ''}
          fallback={accent}
          onChange={(textColor) => onChange({ textColor })}
        />
        <ColorField
          label={t('widget.spectrumColor')}
          value={spec.color ?? ''}
          fallback={accent}
          onChange={(color) => onChange({ color })}
        />
      </Group>
      <Group title={t('widget.position')}>
        <PlacementFields spec={spec} onChange={onChange} />
      </Group>
    </>
  )
}

function AmbientPanel({ spec, accent, onChange, onReset }) {
  return (
    <>
      <Group title={t('widget.show')} onReset={onReset}>
        <ToggleField
          label={t('ambient.enable')}
          note={t('ambient.enableNote')}
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      <Group title={t('widget.appearance')}>
        <ChipField
          label={t('widget.form')}
          value={spec.variant}
          options={AMBIENT_VARIANTS}
          onChange={(variant) => onChange({ variant })}
        />
        <ColorField
          label={t('widget.color')}
          value={spec.color ?? ''}
          fallback={AMBIENT_FIXED_COLORS[spec.variant] ?? accent}
          onChange={(color) => onChange({ color })}
        />
        <SliderField
          label={t('ambient.speed')}
          value={spec.speed}
          min={AMBIENT_SPEED_MIN}
          max={AMBIENT_SPEED_MAX}
          step={1}
          suffix="%"
          onChange={(speed) => onChange({ speed })}
        />
      </Group>
      <Group title={t('widget.density')}>
        <div className="ws-pair">
          <SliderField
            label={t('widget.density2')}
            value={spec.density}
            min={10}
            max={300}
            step={1}
            suffix="%"
            onChange={(density) => onChange({ density })}
          />
          <SliderField
            label={t('widget.size')}
            value={spec.size}
            min={20}
            max={300}
            step={1}
            suffix="%"
            onChange={(size) => onChange({ size })}
          />
        </div>
        <SliderField
          label={t('widget.opacity')}
          value={spec.intensity}
          min={0}
          max={300}
          step={1}
          suffix="%"
          onChange={(intensity) => onChange({ intensity })}
        />
      </Group>
    </>
  )
}

function PointerPanel({ spec, accent, onChange, onReset }) {
  return (
    <>
      <Group title={t('widget.show')} onReset={onReset}>
        <ToggleField
          label={t('pointer.enable')}
          note={t('pointer.enableNote')}
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      <Group title={t('widget.channels')}>
        <div className="ws-pair">
          <ToggleField label={t('widget.trail')} checked={Boolean(spec.trail)} onChange={(trail) => onChange({ trail })} />
          <ToggleField label={t('widget.click')} checked={Boolean(spec.click)} onChange={(click) => onChange({ click })} />
        </div>
        <div className="ws-pair">
          <ChipField
            label={t('widget.trailForm')}
            value={spec.trailVariant}
            options={POINTER_TRAIL_VARIANTS}
            onChange={(trailVariant) => onChange({ trailVariant })}
          />
          <ChipField
            label={t('widget.clickForm')}
            value={spec.clickVariant}
            options={POINTER_CLICK_VARIANTS}
            onChange={(clickVariant) => onChange({ clickVariant })}
          />
        </div>
      </Group>
      <Group title={t('widget.appearance')}>
        <ColorField
          label={t('widget.color')}
          value={spec.color ?? ''}
          fallback={accent}
          onChange={(color) => onChange({ color })}
        />
        <div className="ws-pair">
          <SliderField
            label={t('widget.size')}
            value={spec.size}
            min={20}
            max={300}
            step={1}
            suffix="%"
            onChange={(size) => onChange({ size })}
          />
          <SliderField
            label={t('widget.intensity')}
            value={spec.intensity}
            min={0}
            max={300}
            step={1}
            suffix="%"
            onChange={(intensity) => onChange({ intensity })}
          />
        </div>
      </Group>
    </>
  )
}

const PANELS = {
  clock: ClockPanel,
  spectrum: SpectrumPanel,
  albumArt: AlbumPanel,
  ambient: AmbientPanel,
  pointer: PointerPanel,
}

export const OVERLAY_TABS = [
  { key: 'clock', label: () => t('widget.clock') },
  { key: 'spectrum', label: () => t('widget.spectrum') },
  { key: 'albumArt', label: () => t('widget.album') },
  { key: 'ambient', label: () => t('widget.ambient') },
  { key: 'pointer', label: () => t('widget.pointer') },
]

export default function OverlaySettings({ tab, overlay, onChange, onReset }) {
  const spec = overlay[tab]
  const Panel = PANELS[tab]
  if (!spec || !Panel) return null

  return (
    <Panel
      spec={spec}
      accent={overlay.accent}
      onChange={(patch) => onChange(tab, patch)}
      onReset={() => onReset(tab)}
    />
  )
}
