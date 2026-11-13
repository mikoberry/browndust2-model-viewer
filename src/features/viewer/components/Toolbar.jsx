import { assetUrl } from '../../../lib/assets.js'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

export default function Toolbar({
  model,
  playing,
  loop,
  speed,
  zoom,
  bgMode,
  backdropUrl,
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

      <div className="toolbar-group toolbar-group-right">
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
  )
}
