// Per-widget settings panels for the WallKit control overlays. One panel per
// drawer tab; every panel edits the live `overlay` object held by
// WallpaperPage, so changes apply to the wallpaper immediately and are only
// persisted by the drawer's "copy config" exit.
//
// Option lists come from wallkit itself wherever it exports them, so a new
// variant in the library shows up here without a second source of truth.

import { Group, AnchorPicker, ChipField, ColorField, SliderField, TextField, ToggleField } from './settings-fields.jsx'

// Option lists are rendered as button chips (never a <select>), so labels are
// kept short; the library's own identifier is in the button's `title`/tooltip.
// Not exported by wallkit (only documented in the component's JSDoc).
const CLOCK_PLACEMENTS = [
  { value: 'card', label: '卡片' },
  { value: 'bar', label: '条形' },
  { value: 'minimal', label: '极简' },
  { value: 'cyberpunk', label: '赛博' },
  { value: 'infobar', label: '信息条' },
  { value: 'split', label: '分栏' },
  { value: 'poster', label: '海报' },
  { value: 'ring', label: '环形' },
  { value: 'segments', label: '三段' },
  { value: 'stamp', label: '记录卡' },
]

// WallKit convention: the name is the TEXT colour.
const THEMES = [
  { value: 'light', label: '浅色文字' },
  { value: 'dark', label: '深色文字' },
]

const SPECTRUM_VARIANTS = [
  { value: 'bars', label: '柱状' },
  { value: 'mirror', label: '镜像' },
  { value: 'curve', label: '曲线' },
  { value: 'pill', label: '胶囊' },
  { value: 'ring', label: '环形' },
  { value: 'ringwave', label: '环形波' },
  { value: 'dots', label: '点阵' },
  { value: 'ripples', label: '涟漪' },
  { value: 'aurora', label: '极光' },
]

const ALBUM_VARIANTS = [
  { value: 'classic', label: '经典' },
  { value: 'glass', label: '毛玻璃' },
  { value: 'vinyl', label: '唱片' },
  { value: 'minimal', label: '极简' },
  { value: 'bar', label: '条形' },
  { value: 'wall', label: '墙面' },
]

const AMBIENT_VARIANTS = [
  { value: 'snow', label: '飘雪' },
  { value: 'sakura', label: '樱花' },
  { value: 'bubble', label: '气泡' },
]

const POINTER_TRAIL_VARIANTS = [
  { value: 'glow', label: '柔光' },
  { value: 'ribbon', label: '丝带' },
  { value: 'bubble', label: '气泡' },
  { value: 'firework', label: '烟花' },
]

const POINTER_CLICK_VARIANTS = [
  { value: 'ripple', label: '涟漪' },
  { value: 'sparks', label: '星尘' },
  { value: 'bubble', label: '气泡' },
  { value: 'firework', label: '烟花' },
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
          label="水平偏移"
          value={offsetX}
          min={xMin}
          max={xMax}
          step={0.5}
          suffix=" %"
          onChange={(value) => onChange({ offsetX: value })}
        />
        <SliderField
          label="垂直偏移"
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
          当前偏移不是纯数字（配置文件里写了 CSS 长度），面板按百分比显示为 0；改动后会写回数字。
        </p>
      )}
    </>
  )
}

function ClockPanel({ spec, onChange, onReset }) {
  return (
    <>
      <Group title="显示" onReset={onReset}>
        <ToggleField label="在壁纸上显示时钟" checked={spec.enabled} onChange={(enabled) => onChange({ enabled })} />
      </Group>
      <Group title="外观">
        <ChipField
          label="布局"
          value={spec.placement}
          options={CLOCK_PLACEMENTS}
          onChange={(placement) => onChange({ placement })}
        />
        <div className="ws-pair">
          <ChipField label="文字色" value={spec.theme} options={THEMES} onChange={(theme) => onChange({ theme })} />
          <SliderField
            label="尺寸"
            value={spec.size}
            min={40}
            max={200}
            step={1}
            suffix="%"
            onChange={(size) => onChange({ size })}
          />
        </div>
      </Group>
      <Group title="位置" note="锚点描述「视口上的一点」与「控件上同名的一点」重合；偏移从锚点向内计。">
        <PlacementFields spec={spec} onChange={onChange} />
      </Group>
      <Group title="交互">
        <ToggleField
          label="指针倾斜"
          note="跟随鼠标做 3D 倾斜，WE 桌面壁纸里通常收不到鼠标事件"
          checked={Boolean(spec.tilt)}
          onChange={(tilt) => onChange({ tilt })}
        />
        <ToggleField
          label="音频响应"
          note="随低频鼓点缩放，需要 WE 音频数据"
          checked={Boolean(spec.beat)}
          onChange={(beat) => onChange({ beat })}
        />
        {spec.beat && (
          <div className="ws-pair">
            <SliderField
              label="响应强度"
              value={spec.beatIntensity ?? 100}
              min={0}
              max={1000}
              step={1}
              onChange={(beatIntensity) => onChange({ beatIntensity })}
            />
            <SliderField
              label="响应曲线"
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
  return (
    <>
      <Group title="显示" onReset={onReset}>
        <ToggleField
          label="在壁纸上显示频谱"
          note="条形数据来自 WE 音频帧；普通浏览器里是平的"
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      <Group title="外观">
        <ChipField
          label="样式"
          value={spec.variant}
          options={SPECTRUM_VARIANTS}
          onChange={(variant) => onChange({ variant })}
        />
        <div className="ws-pair">
          <ColorField
            label="颜色"
            value={spec.color ?? ''}
            fallback={accent}
            onChange={(color) => onChange({ color })}
          />
          <SliderField
            label="尺寸"
            value={spec.size}
            min={20}
            max={500}
            step={1}
            suffix="%"
            onChange={(size) => onChange({ size })}
          />
        </div>
        <div className="ws-pair">
          <TextField
            label="宽度"
            value={spec.width ?? ''}
            placeholder="留空 = 由尺寸决定"
            onChange={(width) => onChange({ width })}
          />
          <TextField
            label="高度"
            value={spec.height ?? ''}
            placeholder="留空 = 由尺寸决定"
            onChange={(height) => onChange({ height })}
          />
        </div>
      </Group>
      <Group title="位置">
        <PlacementFields spec={spec} onChange={onChange} />
      </Group>
      <Group title="响应">
        <div className="ws-pair">
          <SliderField
            label="强度"
            value={spec.intensity}
            min={0}
            max={1000}
            step={1}
            onChange={(intensity) => onChange({ intensity })}
          />
          <SliderField
            label="曲线"
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
      <Group title="显示" onReset={onReset}>
        <ToggleField
          label="在壁纸上显示专辑卡"
          note="没有正在播放的媒体信息时不渲染，不会显示空占位"
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      <Group title="外观">
        <ChipField
          label="布局"
          value={spec.variant}
          options={ALBUM_VARIANTS}
          onChange={(variant) => onChange({ variant })}
        />
        <div className="ws-pair">
          <ChipField label="文字色" value={spec.theme} options={THEMES} onChange={(theme) => onChange({ theme })} />
          <SliderField
            label="尺寸"
            value={spec.size}
            min={20}
            max={300}
            step={1}
            suffix="%"
            onChange={(size) => onChange({ size })}
          />
        </div>
        <ColorField
          label="频谱颜色"
          value={spec.color ?? ''}
          fallback={accent}
          onChange={(color) => onChange({ color })}
        />
      </Group>
      <Group title="位置">
        <PlacementFields spec={spec} onChange={onChange} />
      </Group>
    </>
  )
}

function AmbientPanel({ spec, accent, onChange, onReset }) {
  return (
    <>
      <Group title="显示" onReset={onReset}>
        <ToggleField
          label="在壁纸上显示氛围粒子"
          note="铺满视口，没有位置设置；背景里已有粒子时不要叠这一层"
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      <Group title="外观">
        <ChipField
          label="形态"
          value={spec.variant}
          options={AMBIENT_VARIANTS}
          onChange={(variant) => onChange({ variant })}
        />
        <ColorField
          label="颜色"
          value={spec.color ?? ''}
          fallback={spec.variant === 'sakura' ? '#f5b8cd' : spec.variant === 'snow' ? '#dbe9ff' : accent}
          onChange={(color) => onChange({ color })}
        />
      </Group>
      <Group title="密度与强度">
        <div className="ws-pair">
          <SliderField
            label="密度"
            value={spec.density}
            min={10}
            max={300}
            step={1}
            suffix="%"
            onChange={(density) => onChange({ density })}
          />
          <SliderField
            label="尺寸"
            value={spec.size}
            min={20}
            max={300}
            step={1}
            suffix="%"
            onChange={(size) => onChange({ size })}
          />
        </div>
        <SliderField
          label="不透明度"
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
      <Group title="显示" onReset={onReset}>
        <ToggleField
          label="在壁纸上显示指针特效"
          note="覆盖层铺满视口；WE 桌面壁纸默认不投递鼠标事件，需在 WE 里开启鼠标交互"
          checked={spec.enabled}
          onChange={(enabled) => onChange({ enabled })}
        />
      </Group>
      <Group title="通道">
        <div className="ws-pair">
          <ToggleField label="鼠标拖尾" checked={Boolean(spec.trail)} onChange={(trail) => onChange({ trail })} />
          <ToggleField label="点击特效" checked={Boolean(spec.click)} onChange={(click) => onChange({ click })} />
        </div>
        <div className="ws-pair">
          <ChipField
            label="拖尾形态"
            value={spec.trailVariant}
            options={POINTER_TRAIL_VARIANTS}
            onChange={(trailVariant) => onChange({ trailVariant })}
          />
          <ChipField
            label="点击形态"
            value={spec.clickVariant}
            options={POINTER_CLICK_VARIANTS}
            onChange={(clickVariant) => onChange({ clickVariant })}
          />
        </div>
      </Group>
      <Group title="外观">
        <ColorField
          label="颜色"
          value={spec.color ?? ''}
          fallback={accent}
          onChange={(color) => onChange({ color })}
        />
        <div className="ws-pair">
          <SliderField
            label="尺寸"
            value={spec.size}
            min={20}
            max={300}
            step={1}
            suffix="%"
            onChange={(size) => onChange({ size })}
          />
          <SliderField
            label="强度"
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
  { key: 'clock', label: '时钟' },
  { key: 'spectrum', label: '频谱' },
  { key: 'albumArt', label: '专辑卡' },
  { key: 'ambient', label: '氛围' },
  { key: 'pointer', label: '指针' },
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
