import { formatBytes, formatSeconds } from '../../../lib/assets.js'
import { FACE_ANIM } from '../../../lib/animation.js'
import CompositionPanel from './CompositionPanel.jsx'

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FileList({ title, items }) {
  if (!items.length) return null
  return (
    <div className="file-list">
      <h4>{title}</h4>
      {items.map((item) => (
        <div className="file-row" key={item.source ?? item.file} title={item.note || item.source || item.file}>
          <span className={`file-dot ${item.usable === false ? 'is-muted' : ''}`} />
          <span className="file-name">{item.file}</span>
          {item.from && <span className="file-from">{item.from}</span>}
          {item.width > 0 && item.height > 0 && (
            <span className="file-dim" title="原生像素尺寸（壁纸设计基准）">
              {item.width}×{item.height}
            </span>
          )}
          <span className="file-size">{formatBytes(item.bytes)}</span>
        </div>
      ))}
    </div>
  )
}

export default function Inspector({
  info,
  model,
  tab,
  onTabChange,
  animation,
  onAnimationChange,
  expression,
  onExpressionChange,
  skin,
  onSkinChange,
  showBones,
  onShowBonesChange,
  showBounds,
  onShowBoundsChange,
  composition,
}) {
  const animations = info?.animations ?? []
  const bodyAnimations = animations.filter((item) => !FACE_ANIM.test(item.name))
  const faceAnimations = animations.filter((item) => FACE_ANIM.test(item.name))
  const skins = info?.skins ?? []

  return (
    <aside className="inspector">
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'animations'}
          className={tab === 'animations' ? 'is-active' : ''}
          onClick={() => onTabChange('animations')}
        >
          动画
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'compose'}
          className={tab === 'compose' ? 'is-active' : ''}
          onClick={() => onTabChange('compose')}
          title="按壁纸的构图预览并调数值"
        >
          构图
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'info'}
          className={tab === 'info' ? 'is-active' : ''}
          onClick={() => onTabChange('info')}
        >
          信息
        </button>
      </div>

      <div className="inspector-scroll">
        {tab === 'compose' ? (
          <CompositionPanel {...composition} />
        ) : tab === 'animations' ? (
          <>
            <div className="section-head">
              <h3>动画轨道 0</h3>
              <span className="badge">{bodyAnimations.length}</span>
            </div>
            <div className="anim-list">
              {bodyAnimations.length === 0 && <p className="muted">载入模型后显示动画列表</p>}
              {bodyAnimations.map((item) => (
                <button
                  type="button"
                  key={item.name}
                  className={`anim-item ${item.name === animation ? 'is-active' : ''}`}
                  onClick={() => onAnimationChange(item.name)}
                  title={
                    item.layers?.length
                      ? `已合并叠加层：${item.layers.join('、')}`
                      : undefined
                  }
                >
                  <span className="anim-name">{item.name}</span>
                  {item.layers?.length > 0 && (
                    <span className="anim-layers">+{item.layers.length} 层</span>
                  )}
                  <span className="anim-duration">{formatSeconds(item.duration)}</span>
                </button>
              ))}
            </div>

            {faceAnimations.length > 0 && (
              <>
                <div className="section-head">
                  <h3>表情叠加（轨道 1）</h3>
                </div>
                <select
                  className="full-select"
                  value={expression}
                  onChange={(e) => onExpressionChange(e.target.value)}
                  aria-label="表情动画"
                >
                  <option value="">不叠加</option>
                  {faceAnimations.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <p className="hint">
                  角色立绘只播 idle 会得到一张白脸，五官由 _faceN 附件动画在轨道 1 提供。
                </p>
              </>
            )}

            {skins.length > 1 && (
              <>
                <div className="section-head">
                  <h3>皮肤</h3>
                </div>
                <select
                  className="full-select"
                  value={skin}
                  onChange={(e) => onSkinChange(e.target.value)}
                  aria-label="皮肤"
                >
                  <option value="">默认</option>
                  {skins.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </>
            )}

            <div className="section-head">
              <h3>调试显示</h3>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={showBones}
                onChange={(e) => onShowBonesChange(e.target.checked)}
              />
              显示骨骼线
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={showBounds}
                onChange={(e) => onShowBoundsChange(e.target.checked)}
              />
              显示包围盒
            </label>
          </>
        ) : (
          <>
            <div className="section-head">
              <h3>模型信息</h3>
            </div>
            {!info ? (
              <p className="muted">载入模型后显示信息</p>
            ) : (
              <div className="info-grid">
                <InfoRow label="Spine 版本" value={info.version} />
                <InfoRow label="骨骼数" value={info.bones} />
                <InfoRow label="槽位数" value={info.slots} />
                <InfoRow label="皮肤数" value={info.skins.length} />
                <InfoRow label="动画数" value={info.animations.length} />
                <InfoRow label="图集页" value={model?.pages.length ?? 0} />
                <InfoRow label="声明尺寸" value={`${Math.round(info.width)} × ${Math.round(info.height)}`} />
                <InfoRow
                  label="初始包围盒"
                  value={
                    info.setupBounds
                      ? `${Math.round(info.setupBounds.width)} × ${Math.round(info.setupBounds.height)}`
                      : '—'
                  }
                />
                <InfoRow label="素材体积" value={model ? formatBytes(model.totalBytes) : '—'} />
              </div>
            )}

            {model && (
              <>
                <FileList title="骨骼与图集" items={[model.skeleton, model.atlas, ...model.pages]} />
                <FileList title="背景图候选" items={model.backdrops} />
                <div className="notice">
                  <strong>素材注意</strong>
                  <p>
                    BD2 图集没有预乘 alpha，渲染固定用 <code>drawSkeleton(skeleton, false)</code>；
                    否则大面积半透明叠加会被白板盖住。
                  </p>
                  <p>
                    背景按文件名里的 6 位角色 ID 从 <code>backdrops/&lt;id&gt;/</code> 自动关联；
                    带 <code>-N</code> / <code>_N</code> 的是局部遮罩，<code>*move</code> 是低清版，
                    都不适合当完整场景底图，下拉里归到「不推荐」。
                  </p>
                </div>
                {model.issues.length > 0 && (
                  <div className="notice notice-warning">
                    <strong>扫描发现的问题</strong>
                    {model.issues.map((issue) => (
                      <p key={issue}>{issue}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
