import { formatBytes } from '../../../lib/assets.js'

export default function ModelSidebar({ models, warnings, selectedId, onSelect }) {
  const groups = []
  for (const model of models) {
    let group = groups.find((g) => g.name === model.character)
    if (!group) {
      group = { name: model.character, items: [] }
      groups.push(group)
    }
    group.items.push(model)
  }

  return (
    <aside className="sidebar">
      <div className="panel-head">
        <h2>模型库</h2>
        <span className="badge">{models.length}</span>
      </div>

      <div className="sidebar-scroll">
        {groups.length === 0 && (
          <div className="empty-note">
            <strong>没有找到模型</strong>
            <p>
              把一套 Spine 素材（.skel / .json + .atlas + 图集页 PNG）放进{' '}
              <code>model-library/&lt;角色&gt;/&lt;皮肤&gt;/</code>，刷新页面即可自动出现。
            </p>
          </div>
        )}

        {groups.map((group) => (
          <section className="model-group" key={group.name}>
            <h3 className="group-title">{group.name}</h3>
            {group.items.map((model) => (
              <button
                type="button"
                key={model.id}
                className={`model-item ${model.id === selectedId ? 'is-active' : ''}`}
                onClick={() => onSelect(model.id)}
                title={model.id}
              >
                <span className="model-item-title">{model.skin || model.label}</span>
                <span className="model-item-meta">
                  {model.charId || model.label} · {model.pages.length} 页 ·{' '}
                  {formatBytes(model.totalBytes)}
                </span>
                {model.issues.length > 0 && (
                  <span className="model-item-warning">{model.issues.length} 项问题</span>
                )}
              </button>
            ))}
          </section>
        ))}

        {warnings.length > 0 && (
          <div className="sidebar-warnings">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-foot">
        目录 <code>model-library/&lt;角色&gt;/&lt;皮肤&gt;/</code>，只读，不复制到 public
      </div>
    </aside>
  )
}
