// Per-widget settings panels for the WallKit control overlays. One panel per
// drawer tab; every panel edits the live `overlay` object held by
// WallpaperPage, so changes apply to the wallpaper immediately and are only
// persisted by the drawer's "copy config" exit.
//
// Option lists come from wallkit itself wherever it exports them, so a new
// variant in the library shows up here without a second source of truth.

import { Group, AnchorPicker, ChipField, ColorField, SliderField, ToggleField } from './settings-fields.jsx'
import { AMBIENT_SPEED_MIN, AMBIENT_SPEED_MAX } from 'wallkit/components/ambient-fx'
// Spotlight bounds and defaults come from the component itself: its `size` is a
// pixel diameter (80..3000), unlike every other widget's percentage, and the
// 0..1 knobs must not drift from the library's own numbers.
import {
  SPOTLIGHT_SIZE_MIN,
  SPOTLIGHT_SIZE_MAX,
  SPOTLIGHT_SIZE_DEFAULT,
  SPOTLIGHT_FEATHER_MIN,
  SPOTLIGHT_FEATHER_MAX,
  SPOTLIGHT_FEATHER_DEFAULT,
  SPOTLIGHT_DIM_MIN,
  SPOTLIGHT_DIM_MAX,
  SPOTLIGHT_DIM_DEFAULT,
  SPOTLIGHT_GLOW_MIN,
  SPOTLIGHT_GLOW_MAX,
  SPOTLIGHT_GLOW_DEFAULT,
  SPOTLIGHT_SMOOTHING_MIN,
  SPOTLIGHT_SMOOTHING_MAX,
  SPOTLIGHT_SMOOTHING_DEFAULT,
  SPOTLIGHT_DARK_DEFAULT,
  SPOTLIGHT_LIGHT_DEFAULT,
} from 'wallkit/components/spotlight'
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

// Radial styles place their circle inside the box, so the box has to be square
// in PIXELS — that is why both axes use `vh` for them instead of `vw` / `vh`.
//
// `aurora` is NOT one of them even though wallkit's own CSS default box is
// square (it groups it with the ring styles): the renderer walks the columns
// across the full box width and grows a glow up from the bottom edge, i.e. it is
// a wide curtain. A square box just throws away width and stretches the bands,
// so it is sized like the other linear styles.
const SPECTRUM_RADIAL = ['ring', 'ringwave', 'ripples']

// The box each style is designed around, in wallkit's own units: width in `vw`,
// height in `vh` (so 100 == full viewport width / height). Linear styles are a
// strip along an edge (aurora included: its glow needs more height than a bar
// strip, hence the taller default), radial styles a square. These are the
// numbers the size controls fall back to and the ones written when the style is
// switched, so the sliders always show a concrete value.
//
// `size` is NOT exposed: wallkit lets an explicit width / height override the
// `size` scale entirely, and since the panel always writes both axes the slider
// would be dead — the old panel had exactly that trap.
const SPECTRUM_BOX = {
  bars: { width: 100, height: 14 },
  mirror: { width: 100, height: 14 },
  curve: { width: 100, height: 14 },
  pill: { width: 100, height: 14 },
  dots: { width: 100, height: 14 },
  aurora: { width: 100, height: 26 },
  ring: { width: 46, height: 46 },
  ringwave: { width: 46, height: 46 },
  ripples: { width: 46, height: 46 },
}

const spectrumBox = (variant) => SPECTRUM_BOX[variant] ?? SPECTRUM_BOX.bars

// Read a stored CSS length back into a slider number. The panel itself only
// writes `vw` / `vh`, but a hand-written config may hold any unit; the number is
// what the slider shows, and the first edit rewrites it in the panel's unit.
const SPECTRUM_LENGTH = /^(-?\d+(?:\.\d+)?)\s*(vw|vh|vmin|vmax|%|px)?$/i
const lenOf = (value) => {
  const match = SPECTRUM_LENGTH.exec(String(value ?? '').trim())
  return match ? Number(match[1]) : null
}

// Slider numbers for the two axes: the configured value when it parses,
// otherwise the style's own default (never 0 — a 0px box renders nothing).
const spectrumWidth = (spec) => lenOf(spec.width) ?? spectrumBox(spec.variant).width
const spectrumHeight = (spec) => lenOf(spec.height) ?? spectrumBox(spec.variant).height
const spectrumDiameter = (spec) =>
  lenOf(spec.width) ?? lenOf(spec.height) ?? spectrumBox(spec.variant).width

// The list mirrors wallkit's `ALBUM_ART_VARIANTS` (11 layouts). It is spelled
// out here because each entry also needs a translated label; `wallkit` dropped
// the old `wall` layout, and an unknown value falls back to `classic` there.
const ALBUM_VARIANTS = [
  { value: 'classic', label: () => t('album.classic') },
  { value: 'glass', label: () => t('album.glass') },
  { value: 'vinyl', label: () => t('album.vinyl') },
  { value: 'minimal', label: () => t('album.minimal') },
  { value: 'type', label: () => t('album.type') },
  { value: 'bar', label: () => t('album.bar') },
  { value: 'cassette', label: () => t('album.cassette') },
  { value: 'polaroid', label: () => t('album.polaroid') },
  { value: 'cd', label: () => t('album.cd') },
  { value: 'poster', label: () => t('album.poster') },
  { value: 'ticket', label: () => t('album.ticket') },
]

// wallkit's card `spectrum` prop is tri-state (`undefined` = follow the layout);
// the drawer has to pick a concrete value, so 'auto' stands for that `undefined`
// and `WallpaperOverlay` maps it back. 'auto' is not the same as 'on': the
// `vinyl` layout draws a ring that bleeds past the card, so the library keeps it
// opt-in there.
const ALBUM_SPECTRUM_OPTIONS = [
  { value: 'auto', label: () => t('album.spectrumAuto') },
  { value: 'on', label: () => t('album.spectrumOn') },
  { value: 'off', label: () => t('album.spectrumOff') },
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
      <Group title={t('widget.show')} onReset={onReset} note={spec.enabled ? undefined : t('widget.enableHint')}>
        <ToggleField label={t('clock.enable')} checked={spec.enabled} onChange={(enabled) => onChange({ enabled })} />
      </Group>
      {/* Everything below only exists while the widget is on: an unchecked
          widget can neither be seen nor adjusted, so its knobs stay folded
          away instead of inviting edits that change nothing on screen. */}
      {spec.enabled && (
        <>
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
              // wallkit clamps `Clock` to CLOCK_SIZE_MAX (400 since 86fe749),
              // so keep this in step with the library or the top of the range
              // silently renders at the cap.
              max={400}
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
                  // 1 = linear (user default), not wallkit's 0.62: the built-in
                  // config pins the same value, so the readout and the card
                  // always agree.
                  value={spec.beatCurve ?? 1}
                  min={0.2}
                  max={2}
                  step={0.01}
                  onChange={(beatCurve) => onChange({ beatCurve })}
                />
              </div>
            )}
          </Group>
        </>
      )}
    </>
  )
}

function SpectrumPanel({ spec, accent, onChange, onReset }) {
  const radial = SPECTRUM_RADIAL.includes(spec.variant)
  const diameter = spectrumDiameter(spec)
  return (
    <>
      <Group title={t('widget.show')} onReset={onReset} note={spec.enabled ? undefined : t('widget.enableHint')}>
        <ToggleField
          label={t('spectrum.enable')}
          note={t('spectrum.enableNote')}
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      {spec.enabled && (
        <>
          <Group title={t('widget.appearance')}>
            <ChipField
              label={t('widget.style')}
              value={spec.variant}
              options={SPECTRUM_VARIANTS}
              onChange={(variant) => {
                // Switching style rewrites the box to that style's own shape:
                // radial styles need a square (both axes in `vh`), linear ones a
                // strip. Carrying the old numbers over would squash a ring or
                // shrink a bar strip to a square.
                const next = spectrumBox(variant)
                const square = SPECTRUM_RADIAL.includes(variant)
                onChange({
                  variant,
                  width: `${next.width}${square ? 'vh' : 'vw'}`,
                  height: `${next.height}vh`,
                })
              }}
            />
            <ColorField
              label={t('widget.color')}
              value={spec.color ?? ''}
              fallback={accent}
              onChange={(color) => onChange({ color })}
            />
            {radial ? (
              <SliderField
                label={t('widget.diameter')}
                value={diameter}
                min={10}
                max={100}
                step={1}
                suffix=" vh"
                onChange={(value) => onChange({ width: `${value}vh`, height: `${value}vh` })}
              />
            ) : (
              <div className="ws-pair">
                <SliderField
                  label={t('widget.width')}
                  value={spectrumWidth(spec)}
                  min={10}
                  max={100}
                  step={1}
                  suffix=" vw"
                  onChange={(width) => onChange({ width: `${width}vw` })}
                />
                <SliderField
                  label={t('widget.height')}
                  value={spectrumHeight(spec)}
                  min={2}
                  max={60}
                  step={1}
                  suffix=" vh"
                  onChange={(height) => onChange({ height: `${height}vh` })}
                />
              </div>
            )}
            <p className="ws-note">{t('spectrum.sizeNote')}</p>
            <SliderField
              label={t('widget.barCount')}
              value={spec.barCount ?? 128}
              min={8}
              max={128}
              step={1}
              onChange={(barCount) => onChange({ barCount })}
            />
            <p className="ws-note">{t('spectrum.barCountNote')}</p>
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
      )}
    </>
  )
}

function AlbumPanel({ spec, accent, onChange, onReset }) {
  return (
    <>
      <Group title={t('widget.show')} onReset={onReset} note={spec.enabled ? undefined : t('widget.enableHint')}>
        <ToggleField
          label={t('album.enable')}
          note={t('album.enableNote')}
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      {spec.enabled && (
        <>
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
            <ChipField
              label={t('widget.albumSpectrum')}
              value={spec.spectrum ?? 'auto'}
              options={ALBUM_SPECTRUM_OPTIONS}
              onChange={(spectrum) => onChange({ spectrum })}
            />
            <p className="ws-note">{t('album.spectrumNote')}</p>
          </Group>
          <Group title={t('widget.position')}>
            <PlacementFields spec={spec} onChange={onChange} />
          </Group>
        </>
      )}
    </>
  )
}

function AmbientPanel({ spec, accent, onChange, onReset }) {
  return (
    <>
      <Group title={t('widget.show')} onReset={onReset} note={spec.enabled ? undefined : t('widget.enableHint')}>
        <ToggleField
          label={t('ambient.enable')}
          note={t('ambient.enableNote')}
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      {spec.enabled && (
        <>
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
      )}
    </>
  )
}

function PointerPanel({ spec, spotlight, accent, onChange, onSpotlightChange, onReset, onResetSpotlight }) {
  // Percent readout for the 0..1 knobs: the stored value stays a ratio (that is
  // what wallkit takes), the drawer speaks in percent like the other widgets.
  const pct = (value, fallback) => {
    const ratio = Number.isFinite(Number(value)) ? Number(value) : fallback
    return `${Math.round(ratio * 100)}%`
  }
  return (
    <>
      <Group title={t('widget.show')} onReset={onReset} note={spec.enabled ? undefined : t('widget.enableHint')}>
        <ToggleField
          label={t('pointer.enable')}
          note={t('pointer.enableNote')}
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      {spec.enabled && (
        <>
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
      )}
      {/* The spotlight lives in this tab on purpose: it is the other full-bleed
          layer driven purely by pointer input, and it is what the trail often
          pairs with. It keeps its own config key (`overlay.spotlight`), so the
          two can be enabled independently. */}
      {spotlight && (
        <>
          <Group
            title={t('spotlight.title')}
            onReset={onResetSpotlight}
            note={spotlight.enabled ? undefined : t('widget.enableHint')}
          >
            <ToggleField
              label={t('spotlight.enable')}
              note={t('spotlight.enableNote')}
              checked={Boolean(spotlight.enabled)}
              onChange={(enabled) => onSpotlightChange({ enabled })}
            />
            <p className="ws-note">{t('spotlight.noPosition')}</p>
          </Group>
          {spotlight.enabled && (
            <>
              <Group title={t('spotlight.shape')}>
                <SliderField
                  label={t('spotlight.size')}
                  value={spotlight.size ?? SPOTLIGHT_SIZE_DEFAULT}
                  min={SPOTLIGHT_SIZE_MIN}
                  max={SPOTLIGHT_SIZE_MAX}
                  step={10}
                  suffix="px"
                  onChange={(size) => onSpotlightChange({ size })}
                />
                <div className="ws-pair">
                  <SliderField
                    label={t('spotlight.feather')}
                    value={spotlight.feather ?? SPOTLIGHT_FEATHER_DEFAULT}
                    min={SPOTLIGHT_FEATHER_MIN}
                    max={SPOTLIGHT_FEATHER_MAX}
                    step={0.01}
                    readout={pct(spotlight.feather, SPOTLIGHT_FEATHER_DEFAULT)}
                    onChange={(feather) => onSpotlightChange({ feather })}
                  />
                  <SliderField
                    label={t('spotlight.dim')}
                    value={spotlight.dim ?? SPOTLIGHT_DIM_DEFAULT}
                    min={SPOTLIGHT_DIM_MIN}
                    max={SPOTLIGHT_DIM_MAX}
                    step={0.01}
                    readout={pct(spotlight.dim, SPOTLIGHT_DIM_DEFAULT)}
                    onChange={(dim) => onSpotlightChange({ dim })}
                  />
                </div>
                <SliderField
                  label={t('spotlight.glow')}
                  value={spotlight.glow ?? SPOTLIGHT_GLOW_DEFAULT}
                  min={SPOTLIGHT_GLOW_MIN}
                  max={SPOTLIGHT_GLOW_MAX}
                  step={0.01}
                  readout={pct(spotlight.glow, SPOTLIGHT_GLOW_DEFAULT)}
                  onChange={(glow) => onSpotlightChange({ glow })}
                />
              </Group>
              <Group title={t('spotlight.lightGroup')}>
                <div className="ws-pair">
                  <ColorField
                    label={t('spotlight.darkColor')}
                    value={spotlight.darkColor ?? ''}
                    fallback={SPOTLIGHT_DARK_DEFAULT}
                    allowInherit={false}
                    onChange={(darkColor) => onSpotlightChange({ darkColor })}
                  />
                  <ColorField
                    label={t('spotlight.lightColor')}
                    value={spotlight.lightColor ?? ''}
                    fallback={SPOTLIGHT_LIGHT_DEFAULT}
                    allowInherit={false}
                    onChange={(lightColor) => onSpotlightChange({ lightColor })}
                  />
                </div>
                <SliderField
                  label={t('spotlight.smoothing')}
                  value={spotlight.smoothing ?? SPOTLIGHT_SMOOTHING_DEFAULT}
                  min={SPOTLIGHT_SMOOTHING_MIN}
                  max={SPOTLIGHT_SMOOTHING_MAX}
                  step={0.01}
                  suffix=" s"
                  onChange={(smoothing) => onSpotlightChange({ smoothing })}
                />
                <p className="ws-note">{t('spotlight.smoothingNote')}</p>
              </Group>
            </>
          )}
        </>
      )}
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
      // The pointer tab hosts the spotlight as a second section instead of
      // getting a tab of its own: both are full-bleed pointer-driven layers.
      // It stays a separate config key, hence its own change / reset handlers.
      spotlight={overlay.spotlight}
      onChange={(patch) => onChange(tab, patch)}
      onSpotlightChange={(patch) => onChange('spotlight', patch)}
      onReset={() => onReset(tab)}
      onResetSpotlight={() => onReset('spotlight')}
    />
  )
}
