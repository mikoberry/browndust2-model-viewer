// Development / debug page, served at /spine-viewer.
// This is the full inspector UI; the root route is the bare wallpaper.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { models, warnings } from 'virtual:model-library'
import ModelSidebar from './components/ModelSidebar.jsx'
import Toolbar from './components/Toolbar.jsx'
import Inspector from './components/Inspector.jsx'
import Timeline from './components/Timeline.jsx'
import SpineStage from '../../lib/spine/SpineStage.jsx'
import { pickDefaultAnimation, pickDefaultExpression } from '../../lib/animation.js'

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

function EmptyLibrary() {
  return (
    <div className="empty-library">
      <h1>Spine 模型查看器</h1>
      <p>
        <code>model-library/</code> 里还没有可识别的模型。
      </p>
      <pre>{`model-library/\n  <角色>/\n    <皮肤>/\n      xxx.skel     (或 xxx.json)\n      xxx.atlas\n      xxx.png      (图集页，可为 _2.png / _3.png …)\n  skill_cutscene_background/   (可选共享背景库)`}</pre>
      <p className="muted">放入素材后刷新页面即可，不需要复制到 public/。</p>
    </div>
  )
}

export default function ViewerPage({ onGoWallpaper }) {
  const [selectedId, setSelectedId] = useState(models[0]?.id ?? '')
  const selected = useMemo(
    () => models.find((item) => item.id === selectedId) ?? models[0] ?? null,
    [selectedId],
  )

  const [info, setInfo] = useState(null)
  const [tab, setTab] = useState('animations')
  const [animation, setAnimation] = useState('')
  const [expression, setExpression] = useState('')
  const [skin, setSkin] = useState('')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [showBones, setShowBones] = useState(false)
  const [showBounds, setShowBounds] = useState(false)
  const [fitToken, setFitToken] = useState(0)
  const [resetToken, setResetToken] = useState(0)
  const [progress, setProgress] = useState({ time: 0, duration: 0, percent: 0 })
  const [stats, setStats] = useState({ fps: 0 })
  const [error, setError] = useState(null)
  const [bgMode, setBgMode] = useState('checker')
  const [backdropUrl, setBackdropUrl] = useState('')
  const [seek, setSeek] = useState({ value: 0, token: 0 })
  const seekTokenRef = useRef(0)
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  const selectModel = useCallback((id) => {
    // Clicking the already-selected model must be a no-op. Clearing the panel
    // state here would leave it empty: SpineStage only reports onLoaded when
    // the asset changes, and selecting the same model changes nothing.
    if (id === selectedIdRef.current) return
    setSelectedId(id)
    setInfo(null)
    setAnimation('')
    setExpression('')
    setSkin('')
    setPlaying(true)
    setZoom(1)
    setError(null)
    setProgress({ time: 0, duration: 0, percent: 0 })
    setBgMode('checker')
    setBackdropUrl('')
    setFitToken((token) => token + 1)
  }, [])

  const handleLoaded = useCallback((nextInfo) => {
    // A previous model can finish loading one commit late while the user is
    // switching models; never let it overwrite the new selection.
    if (nextInfo.modelId !== selectedIdRef.current) return
    setInfo(nextInfo)
    setAnimation(pickDefaultAnimation(nextInfo.animations))
    setExpression(pickDefaultExpression(nextInfo.animations))
    setSkin('')
    setPlaying(true)
    setError(null)
    setProgress({ time: 0, duration: 0, percent: 0 })
  }, [])

  const handleError = useCallback((err) => {
    setError(err instanceof Error ? err.message : String(err))
  }, [])

  const handleProgress = useCallback((value) => setProgress(value), [])
  const handleStats = useCallback((value) => setStats(value), [])
  const handleZoomChange = useCallback((value) => setZoom(clamp(value, 0.1, 8)), [])
  const handleSeek = useCallback((value) => {
    seekTokenRef.current += 1
    setSeek({ value, token: seekTokenRef.current })
  }, [])
  const fitView = useCallback(() => {
    setZoom(1)
    setFitToken((token) => token + 1)
  }, [])
  const resetView = useCallback(() => {
    setZoom(1)
    setResetToken((token) => token + 1)
  }, [])
  const handleBackgroundChange = useCallback((mode, url) => {
    setBgMode(mode)
    setBackdropUrl(url)
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      switch (event.code) {
        case 'Space':
          event.preventDefault()
          setPlaying((value) => !value)
          break
        case 'KeyF':
          fitView()
          break
        case 'KeyR':
          resetView()
          break
        case 'Equal':
        case 'NumpadAdd':
          setZoom((value) => clamp(value * 1.2, 0.1, 8))
          break
        case 'Minus':
        case 'NumpadSubtract':
          setZoom((value) => clamp(value / 1.2, 0.1, 8))
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitView, resetView])

  if (!models.length || !selected) return <EmptyLibrary />

  const stageStyle =
    bgMode === 'image' && backdropUrl
      ? { backgroundImage: `url("${backdropUrl}")` }
      : undefined
  const status = error ? 'error' : info ? 'ready' : 'loading'

  return (
    <div className="app-shell">
      <ModelSidebar
        models={models}
        warnings={warnings}
        selectedId={selected.id}
        onSelect={selectModel}
      />

      <main className="workspace">
        <header className="workspace-head">
          <div className="title-row">
            <div>
              <h1>Spine 模型查看器</h1>
              <p className="subtitle">
                {selected.character} / {selected.skin} · {selected.label}
                {info ? ` · Spine ${info.version}` : ''}
              </p>
            </div>
            <div className="head-actions">
              <a
                className="nav-link"
                href="./"
                onClick={(event) => {
                  event.preventDefault()
                  onGoWallpaper?.()
                }}
              >
                ← 壁纸首页
              </a>
              <span className={`status-pill status-${status}`}>
                {status === 'ready' ? '已就绪' : status === 'error' ? '出错' : '载入中'}
              </span>
            </div>
          </div>
          <Toolbar
            model={selected}
            playing={playing}
            loop={loop}
            speed={speed}
            zoom={zoom}
            bgMode={bgMode}
            backdropUrl={backdropUrl}
            onTogglePlay={() => setPlaying((value) => !value)}
            onLoopChange={setLoop}
            onSpeedChange={setSpeed}
            onZoomChange={handleZoomChange}
            onFit={fitView}
            onReset={resetView}
            onBackgroundChange={handleBackgroundChange}
          />
        </header>

        <div className={`stage-area stage-bg-${bgMode}`} style={stageStyle}>
          <SpineStage
            model={selected}
            animation={animation}
            expression={expression}
            skin={skin}
            playing={playing}
            speed={speed}
            loop={loop}
            zoom={zoom}
            showBones={showBones}
            showBounds={showBounds}
            infoReady={Boolean(info)}
            fitToken={fitToken}
            resetToken={resetToken}
            seek={seek}
            onZoomChange={handleZoomChange}
            onProgress={handleProgress}
            onStats={handleStats}
            onLoaded={handleLoaded}
            onError={handleError}
            onFit={fitView}
          />
        </div>

        <Timeline progress={progress} onSeek={handleSeek} disabled={!info} />

        <footer className="statusbar">
          <span className="statusbar-left">
            <span className={`status-dot status-${status}`} />
            {selected.id}
            {animation && <span className="statusbar-anim"> · {animation}</span>}
          </span>
          <span className="statusbar-right">
            <span>{stats.fps} FPS</span>
            <span>{Math.round(zoom * 100)}%</span>
            <span className="statusbar-hint">空格 播放/暂停 · F 适应 · R 重置 · 滚轮缩放 · 拖拽平移 · 双击适应</span>
          </span>
        </footer>
      </main>

      <Inspector
        info={info}
        model={selected}
        tab={tab}
        onTabChange={setTab}
        animation={animation}
        onAnimationChange={setAnimation}
        expression={expression}
        onExpressionChange={setExpression}
        skin={skin}
        onSkinChange={setSkin}
        showBones={showBones}
        onShowBonesChange={setShowBones}
        showBounds={showBounds}
        onShowBoundsChange={setShowBounds}
      />

      {error && (
        <div className="error-toast" role="alert">
          <strong>出错</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="关闭错误提示">
            ×
          </button>
        </div>
      )}
    </div>
  )
}
