import { assetUrl } from '../../../lib/assets.js'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// Stage viewport shape: common screen RATIOS × orientation, shown as two
// intersecting button groups (ratio + 横/竖) instead of one button per combo.
// Key encoding: `<ratio>-<orientation>`, e.g. '16:9-h'.
const VIEWPORT_RATIOS = [
  { key: '16:9', label: '16:9', title: '桌面 / 1080P、2K 显示器' },
  { key: '21:9', label: '21:9', title: '带鱼屏' },
  { key: '16:10', label: '16:10', title: '部分笔记本 / 2K 显示器' },
  { key: '4:3', label: '4:3', title: '平板' },
  { key: '1:1', label: '1:1', title: '正方形（横竖裁切完全对称）' },
]
const VIEWPORT_ORIENTS = [
  { key: 'h', label: '横屏' },
  { key: 'v', label: '竖屏' },
]

export default function Toolbar({
  model,
  playing,
  loop,
  speed,
  zoom,
  bgMode,
  backdropUrl,
  stageRatio,
  onStageRatioChange,
  showCross,
  onShowCrossChange,
  composeOn = false,
  onTogglePlay,
  onLoopChange,
  onSpeedChange,
  onZoomChange,
  onFit,
  onReset,
  onBackgroundChange,
}) {
  const backdrops = model?.backdrops ?? []
  const backdropGroups = [
    { label: '皮肤目录背景', items: backdrops.filter((b) => b.usable && b.from === '皮肤目录') },
    { label: '背景库 · 完整场景', items: backdrops.filter((b) => b.usable && b.from !== '皮肤目录') },
    { label: '不推荐（局部层 / 低清）', items: backdrops.filter((b) => !b.usable) },
  ].filter((group) => group.items.length > 0)
  const bgValue = bgMode === 'image' ? `image:${backdropUrl}` : bgMode

  const handleBgChange = (event) => {
    const value = event.target.value
    if (value.startsWith('image:')) {
      onBackgroundChange('image', value.slice(6))
    } else {
      onBackgroundChange(value, '')
    }
  }

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button
          type="button"
          className={`btn btn-primary ${playing ? '' : 'is-paused'}`}
          onClick={onTogglePlay}
          title="播放 / 暂停（空格）"
        >
          {playing ? '暂停' : '播放'}
        </button>
        <button
          type="button"
          className={`btn ${loop ? 'is-on' : ''}`}
          onClick={() => onLoopChange(!loop)}
          title="循环播放当前动画"
        >
          循环
        </button>
        <label className="inline-field" title="播放倍速">
          倍速
          <select
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            aria-label="播放倍速"
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="toolbar-group">
        <span className="toolbar-divider" />
        <button type="button" className="btn btn-icon" onClick={() => onZoomChange(clamp(zoom / 1.2, 0.1, 8))} title="缩小">
          −
        </button>
        <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
        <button type="button" className="btn btn-icon" onClick={() => onZoomChange(clamp(zoom * 1.2, 0.1, 8))} title="放大">
          +
        </button>
        <button type="button" className="btn" onClick={onFit} title="适应画布（F / 双击画布）">
          适应
        </button>
        <button type="button" className="btn" onClick={onReset} title="重置视图（R）">
          重置
        </button>
      </div>

      <div className="toolbar-side">
        <div className="toolbar-group">
          <span className="inline-field" title="预览区比例">
            视口
          </span>
          {VIEWPORT_RATIOS.map((item) => {
            const [ratio, orient] = stageRatio.split('-')
            const active = ratio === item.key
            return (
              <button
                key={item.key}
                type="button"
                className={`btn${active ? ' is-on' : ''}`}
                aria-pressed={active}
                title={item.title}
                onClick={() => onStageRatioChange(`${item.key}-${orient || 'h'}`)}
              >
                {item.label}
              </button>
            )
          })}
          {VIEWPORT_ORIENTS.map((item) => {
            const active = stageRatio.endsWith(`-${item.key}`)
            return (
              <button
                key={item.key}
                type="button"
                className={`btn${active ? ' is-on' : ''}`}
                aria-pressed={active}
                onClick={() => onStageRatioChange(`${stageRatio.split('-')[0]}-${item.key}`)}
              >
                {item.label}
              </button>
            )
          })}
          <button
            type="button"
            className={`btn${showCross ? ' is-on' : ''}`}
            aria-pressed={showCross}
            disabled={!composeOn}
            title={
              composeOn
                ? '在画布上标出当前比例与其倒数（如 16:9 ↔ 9:16）cover 裁切后都可见的交叠区域'
                : '先开启构图预览（右侧「固定设计画布预览」）再标交叉区域'
            }
            onClick={() => onShowCrossChange(!showCross)}
          >
            交叉区域
          </button>
        </div>
        <div className="toolbar-group">
          <label className="inline-field" title="画布背景">
            背景
            <select value={bgValue} onChange={handleBgChange} aria-label="画布背景">
              <option value="checker">棋盘格</option>
              <option value="light">浅灰</option>
              <option value="dark">深灰</option>
              {backdropGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((item) => (
                    <option key={item.source} value={`image:${assetUrl(item.url)}`}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}
