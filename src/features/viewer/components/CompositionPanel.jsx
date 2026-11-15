// Composition panel for the debug viewer.
//
// The wallpaper route only *shows* the composition: its drawer has no room for
// a background picker, and tuning a cutscene framing by eye needs the animation
// list, so the real tuning happens here. Everything is in design-canvas units,
// i.e. the exact numbers wallpaper.config.json expects, and "复制配置" emits the
// complete file (the shipped one with these values overwritten) ready to paste.
//
// An entrance sequence is a CHAIN of shots, so the panel edits one clip at a
// time: each of cut_A / cut_B / loop_2 keeps its own backdrop, scale and offsets,
// and the wallpaper joins them at playback time.
//
// It also edits the loop animation / expression / click reaction — the fields
// that used to be file-only — and "复制配置" emits all of them (plus the
// currently selected modelId) alongside the composition values.
//
// Unlike the wallpaper drawer this page has a real keyboard and no CEF host, so
// native range / number / select inputs are fine here. Keep them out of the
// wallpaper feature — that is where the popup and no-keyboard rules apply.

import { useEffect, useState } from 'react'
import { FACE_ANIM } from '../../../lib/animation.js'
import { variantLabel } from '../../../lib/variants.js'

const round2 = (value) => Math.round(value * 100) / 100
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const SCALE_MIN = 0.25
const SCALE_MAX = 5 // user cap: 500% of the composed size
const SCALE_STEP = 0.01

// Fixed design-pixel limits for both layers' offsets (user request), so the
// range is identical for every backdrop size.
const OFFSET_LIMIT = 200

const NEUTRAL = { scale: 1, offsetX: 0, offsetY: 0 }

// Scene resolutions the design canvas can be pinned to (user request). 1080p is
// the DEFAULT — a wallpaper is judged on a real screen shape, not on the
// artwork's own pixel size. "跟随背景" (= null) keeps the backdrop's native size,
// which never crops the image.
export const DESIGN_PRESETS = [
  { label: '1920×1080', width: 1920, height: 1080 },
  { label: '2560×1440', width: 2560, height: 1440 },
  { label: '1080×1920', width: 1080, height: 1920 },
  { label: '1440×2560', width: 1440, height: 2560 },
]

// Kept identical to the built-in `design` in features/wallpaper/config.js, and
// to the shipped value in public/wallpaper.config.json.
export const DEFAULT_DESIGN = { width: DESIGN_PRESETS[0].width, height: DESIGN_PRESETS[0].height }

// The config file expresses "which animation plays after the entrance" as null
// (auto-pick) and '' (disable the track); a <select> cannot hold those values,
// so the panel maps them to two sentinel strings.
export const ANIM_AUTO = '__auto__'
export const ANIM_OFF = '__off__'
export const animToOption = (value) =>
  value === undefined || value === null ? ANIM_AUTO : value === '' ? ANIM_OFF : String(value)
export const optionToAnim = (option) =>
  option === ANIM_AUTO ? null : option === ANIM_OFF ? '' : option

const layerKeyOf = (which) => (which === 'backdrop' ? 'backdropTransform' : 'modelTransform')

// Range + numeric box, both editing the same value. `draft` keeps the raw text so
// typing "1." or "-" does not get rewritten mid-keystroke.
function NumberRow({ label, value, min, max, step, onChange }) {
  const [draft, setDraft] = useState(String(round2(value)))

  useEffect(() => {
    setDraft(String(round2(value)))
  }, [value])

  const commit = (text) => {
    const next = Number(text)
    if (Number.isFinite(next)) onChange(clamp(next, min, max))
  }

  return (
    <div className="num-row">
      <span className="num-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        className="num-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-label={`${label}（数值）`}
        onChange={(event) => {
          setDraft(event.target.value)
          commit(event.target.value)
        }}
        onBlur={() => setDraft(String(round2(clamp(Number(draft) || 0, min, max))))}
      />
    </div>
  )
}

// Offsets are edited in PERCENT of the design canvas (user request), matching
// the wallpaper drawer: sliders span ±200% (100% = one full canvas width /
// height). The stored spec stays in design pixels; conversion happens here.
const OFFSET_TO_PERCENT = (pixels, basis) => (basis > 0 ? (pixels / basis) * 100 : 0)
const OFFSET_FROM_PERCENT = (percent, basis) => (percent / 100) * basis

function LayerFields({ title, spec, design, onChange }) {
  const value = (raw, fallback) => (Number.isFinite(raw) ? raw : fallback)
  const offsetX = value(spec.offsetX, 0)
  const offsetY = value(spec.offsetY, 0)
  return (
    <>
      <div className="section-head">
        <h3>{title}</h3>
        <span className="badge">{Math.round(value(spec.scale, 1) * 100)}%</span>
      </div>
      <NumberRow
        label="缩放"
        value={value(spec.scale, 1)}
        min={SCALE_MIN}
        max={SCALE_MAX}
        step={SCALE_STEP}
        onChange={(scale) => onChange({ scale })}
      />
      <NumberRow
        label="水平偏移 (%)"
        value={OFFSET_TO_PERCENT(offsetX, design.width)}
        min={-OFFSET_LIMIT}
        max={OFFSET_LIMIT}
        step={0.5}
        onChange={(percent) => onChange({ offsetX: OFFSET_FROM_PERCENT(percent, design.width) })}
      />
      <NumberRow
        label="垂直偏移 (%)"
        value={OFFSET_TO_PERCENT(offsetY, design.height)}
        min={-OFFSET_LIMIT}
        max={OFFSET_LIMIT}
        step={0.5}
        onChange={(percent) => onChange({ offsetY: OFFSET_FROM_PERCENT(percent, design.height) })}
      />
    </>
  )
}

// Backdrop picker shared by the global pick and every clip. `''` is only offered
// for clips ("keep the global pick"); the global select always owns a value.
// `inheritHint` names the picture that "keep the global pick" currently resolves
// to. Without it the option was a trap on a display variant: the variant has its
// own global backdrop, so leaving a clip on inherit pointed it at the VARIANT's
// picture instead of the shot's own one (reported as "cut B still shows cut A's
// background" when the variant's global backdrop is cut A's).
function BackdropSelect({ label, value, options, onChange, allowInherit = false, inheritHint = '' }) {
  return (
    <select className="full-select" value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>
      {allowInherit && (
        <option value="">
          {inheritHint ? `跟随全局背景（${inheritHint}）` : '跟随全局背景'}
        </option>
      )}
      <option value="auto">自动（最高分辨率完整场景）</option>
      <option value="none">无背景</option>
      {/* Keep a hand-written name (e.g. a non-usable backdrop) visible instead of
          letting the select silently fall back to the first option. */}
      {value !== '' && value !== 'auto' && value !== 'none' && !options.some((item) => item.file === value) && (
        <option value={value}>{value}</option>
      )}
      {options.map((item) => (
        <option key={item.source ?? item.file} value={item.file}>
          {item.file}
          {item.width > 0 ? ` · ${item.width}×${item.height}` : ''}
        </option>
      ))}
    </select>
  )
}

// The config file is the thing being edited, so it is what gets emitted: every
// key of the shipped file, with the tuned values overwritten. Key order is kept,
// which makes the pasted result diff-clean against public/wallpaper.config.json.
const layerOf = (item) => ({
  scale: round2(item?.scale ?? 1),
  offsetX: Math.round(item?.offsetX ?? 0),
  offsetY: Math.round(item?.offsetY ?? 0),
})

// Panel view -> config keys. Shared by the live state and by every variant, so a
// variant writes exactly what the sliders show: sentinels become null / '', the
// sequence text becomes an array, offsets are rounded to whole design pixels.
function viewToConfig(view) {
  const clips = {}
  for (const [name, clip] of Object.entries(view?.entrance?.clips ?? {})) {
    if (!name) continue
    clips[name] = {
      backdrop: clip?.backdrop ?? '',
      backdropTransform: layerOf(clip?.backdropTransform),
      modelTransform: layerOf(clip?.modelTransform),
    }
  }
  return {
    backdrop: view?.backdrop,
    backdropTransform: layerOf(view?.backdropTransform),
    modelTransform: layerOf(view?.modelTransform),
    animation: optionToAnim(view?.animation),
    expression: optionToAnim(view?.expression),
    // Only written when actually trimming, so untouched configs stay clean.
    ...(Number(view?.animationStart) > 0 ? { animationStart: round2(Number(view.animationStart)) } : {}),
    clickAnimation: {
      enabled: view?.clickAnimation?.enabled === true,
      name: view?.clickAnimation?.name ?? '',
    },
    entrance: {
      autoplay: view?.entrance?.autoplay !== false,
      blend: round2(view?.entrance?.blend ?? 0),
      clips,
    },
    sequence: String(view?.sequence ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  }
}

// A variant's config slice. `entrance.autoplay` is GLOBAL (`GLOBAL_NESTED` in
// lib/variants.js): only the top level is allowed to carry it, and the reader
// would drop a variant's copy anyway. `blend` and the per-clip framing stay, so
// each look still owns its own cutscene.
function variantConfigOf(view) {
  const out = viewToConfig(view)
  if (out.entrance) {
    const { autoplay, ...rest } = out.entrance
    out.entrance = rest
  }
  return out
}

// `variants` are the per-look overrides; each one is a COMPLETE panel view, so it
// is emitted as a full set of config keys (`design` is deliberately absent — the
// canvas is global, see lib/variants.js). `defaultVariant` becomes the file's
// `variant` key: the one the wallpaper opens on.
//
// The TOP-LEVEL keys come from `baseView`, never from `state`: `state` is
// whatever chip is being edited, so emitting it as the base baked the active
// variant into the base — after one tuning session both look identical and the
// base's own backdrop / animation were gone. `design` stays with `state` because
// it is global (and therefore never differs between chips).
function buildConfigText(fileConfig, baseView, state, variants, defaultVariant) {
  const payload = {
    ...(fileConfig ?? {}),
    ...viewToConfig(baseView),
    // null = follow the backdrop's native size (the shipped default).
    design: state.design
      ? { width: Math.round(state.design.width), height: Math.round(state.design.height) }
      : null,
    variant: defaultVariant || '',
    variants: (variants ?? []).map((item) => ({
      id: item.id,
      ...(item.label ? { label: item.label } : {}),
      ...variantConfigOf(item.view),
    })),
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

export default function CompositionPanel({
  state,
  design,
  backdrops,
  animations,
  playingSequence,
  fileConfig,
  // Complete panel view of the BASE look. Kept apart from `state` so the base
  // half of the emitted JSON does not inherit whatever chip is being edited.
  baseView,
  flash,
  variants,
  editing,
  defaultVariant,
  onEditingChange,
  onVariantAdd,
  onVariantRename,
  onVariantDefault,
  onVariantRemove,
  onPatch,
  onDetect,
  onReplay,
  onCopy,
}) {
  const variantList = variants ?? []
  const editingVariant = editing ? variantList.find((item) => item.id === editing) ?? null : null
  // Is the thing being edited the one the wallpaper opens on? `''` is the base,
  // so it can be the default too (a file without variants has `variant: ''`).
  const isDefaultTarget = editingVariant ? defaultVariant === editingVariant.id : !defaultVariant
  // Local draft so typing a Chinese label does not fight the state round-trip
  // mid-composition; re-synced whenever the edited variant (or its label) moves.
  const [labelDraft, setLabelDraft] = useState('')
  useEffect(() => {
    setLabelDraft(editingVariant ? variantLabel(editingVariant, 'zh') : '')
  }, [editing, editingVariant?.label])

  const isEntrance = state.layer === 'entrance'
  const layerKey = state.layerKey === 'backdrop' ? 'backdrop' : 'model'
  const options = (backdrops ?? []).filter((item) => item.usable !== false)

  // Clip chips follow the sequence text, so editing the list above immediately
  // offers the new shot. `playingSequence` (model-verified names) is preferred.
  const names = playingSequence.length
    ? playingSequence
    : state.sequence
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
  const clipName = state.clip && names.includes(state.clip) ? state.clip : names[0] ?? ''
  const clip = clipName ? state.entrance.clips[clipName] ?? null : null
  // Soloing = the stage loops this one clip instead of chaining the sequence,
  // which is what clicking a chip switches to.
  const soloing = Boolean(state.solo && clipName)

  const replaceClip = (next) => {
    const clips = { ...state.entrance.clips }
    if (next) clips[clipName] = next
    else delete clips[clipName]
    onPatch({ entrance: { ...state.entrance, clips } })
  }

  const patchClip = (patch) => {
    if (!clipName) return
    replaceClip({
      backdrop: clip?.backdrop ?? '',
      backdropTransform: clip?.backdropTransform ?? NEUTRAL,
      modelTransform: clip?.modelTransform ?? NEUTRAL,
      ...patch,
    })
  }

  const composed = { backdrop: state.backdropTransform, model: state.modelTransform }
  const activeSpec = isEntrance ? clip?.[layerKeyOf(layerKey)] ?? NEUTRAL : composed[layerKey]

  const patchActive = (patch) => {
    if (!isEntrance) {
      const key = layerKeyOf(layerKey)
      onPatch({ [key]: { ...state[key], ...patch } })
      return
    }
    patchClip({
      [layerKeyOf(layerKey)]: { ...(clip?.[layerKeyOf(layerKey)] ?? NEUTRAL), ...patch },
    })
  }

  return (
    <div className="compose-panel">
      <label className="check-row">
        <input type="checkbox" checked={state.on} onChange={(event) => onPatch({ on: event.target.checked })} />
        固定设计画布预览
      </label>
      <p className="hint">
        开启后完全按壁纸渲染：背景原生像素 = 设计画布，两层各自缩放 / 平移。工具栏的缩放、背景下拉此时让位给这里。
      </p>

      {state.on && (
        <>
          <div className="section-head">
            <h3>显示立绘</h3>
            <span className="badge">{editingVariant ? variantLabel(editingVariant, 'zh') : '基础'}</span>
          </div>
          <p className="hint">
            同一套模型的多套画面（各自的背景 / 构图 / 入场）。下面所有数值只写入当前选中的这一套；
            设计画布是全局的，不随立绘变化。
          </p>
          <div className="seg-row seg-wrap" role="group" aria-label="显示立绘">
            <button
              type="button"
              className={`btn${!editing ? ' is-on' : ''}`}
              onClick={() => onEditingChange('')}
              title="基础配置：没有立绘时壁纸显示的就是它"
            >
              基础
            </button>
            {variantList.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`btn${editing === item.id ? ' is-on' : ''}`}
                onClick={() => onEditingChange(item.id)}
                title={item.id}
              >
                {defaultVariant === item.id ? '★ ' : ''}
                {variantLabel(item, 'zh')}
              </button>
            ))}
            <button type="button" className="btn" onClick={onVariantAdd} title="以当前显示的画面为副本新建一套">
              + 新增
            </button>
          </div>
          {/* The base is a look too, so it can be the startup one (`variant: ''`).
              Keeping this row outside the `editingVariant` block is what makes
              the choice reversible: once a variant was marked as default, there
              used to be no button left to hand it back to the base. */}
          <div className="seg-row">
            <button
              type="button"
              className={`btn btn-mini${isDefaultTarget ? ' is-on' : ''}`}
              onClick={() => onVariantDefault(editingVariant ? editingVariant.id : '')}
              title="壁纸启动时打开这一套（写回文件的 variant）；「基础」对应 variant 为空"
            >
              {isDefaultTarget ? '启动默认' : '设为启动默认'}
            </button>
            {editingVariant && (
              <button
                type="button"
                className="btn btn-mini"
                onClick={() => onVariantRemove(editingVariant.id)}
                title="删除这一套；全部删掉也是合法的（等价于只有基础）"
              >
                删除该立绘
              </button>
            )}
          </div>
          {editingVariant && (
            <input
              className="full-input"
              type="text"
              value={labelDraft}
              placeholder="立绘名称（显示在壁纸抽屉的按钮上）"
              aria-label="立绘名称"
              onChange={(event) => {
                setLabelDraft(event.target.value)
                onVariantRename(editingVariant.id, event.target.value)
              }}
            />
          )}

          <div className="section-head">
            <h3>设计画布（全局）</h3>
            <span className="badge">
              {Math.round(design.width)} × {Math.round(design.height)}
            </span>
          </div>
          <div className="seg-row seg-wrap" role="group" aria-label="设计画布尺寸">
            <button
              type="button"
              className={`btn${!state.design ? ' is-on' : ''}`}
              onClick={() => onPatch({ design: null })}
              title="画布 = 背景图的原生像素尺寸（默认，最忠实）"
            >
              跟随背景
            </button>
            {DESIGN_PRESETS.map((preset) => {
              const on =
                Number(state.design?.width) === preset.width && Number(state.design?.height) === preset.height
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`btn${on ? ' is-on' : ''}`}
                  onClick={() => onPatch({ design: { width: preset.width, height: preset.height } })}
                  title={`强制 ${preset.label} 的画布，与背景图尺寸无关`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          <BackdropSelect
            label="全局背景"
            value={state.backdrop}
            options={options}
            onChange={(backdrop) => onPatch({ backdrop })}
          />
          <p className="hint">
            {state.design
              ? '已固定画布尺寸：图片按 cover 居中缩放到画布（不变形，但比例不符的部分会被裁掉）。所有偏移量的单位是画布像素，换尺寸后已调的数值会被重新解释。'
              : '画布尺寸跟着这张图的原生像素走；某一段换背景只会换图，不会改画布。想按屏幕比例出图就选一个预设。'}
          </p>

          <div className="section-head">
            <h3>调哪一层构图</h3>
          </div>
          <div className="seg-row" role="group" aria-label="构图层">
            <button
              type="button"
              className={`btn${!isEntrance ? ' is-on' : ''}`}
              onClick={() => onPatch({ layer: 'composed' })}
              title="入场结束后循环播放时使用的构图"
            >
              构图（循环时）
            </button>
            <button
              type="button"
              className={`btn${isEntrance ? ' is-on' : ''}`}
              onClick={() =>
                // Entering the entrance layer means EDITING a shot: loop the
                // selected clip (solo) instead of running the whole chain — the
                // chain only plays via「播放完整入场」. Without a clip yet, take
                // the first one so the stage does not run the full sequence.
                onPatch({
                  layer: 'entrance',
                  solo: true,
                  follow: false,
                  clip: state.clip && names.includes(state.clip) ? state.clip : names[0] || '',
                })
              }
              title="单独循环播放选中的那一段，方便调每段的构图；完整入场用下面的「播放完整入场」"
            >
              入场（按段）
            </button>
          </div>

          {isEntrance && (
            <>
              <div className="section-head">
                <h3>调哪一段</h3>
                {(soloing || state.follow) && (
                  <span className="badge">{soloing ? '单段循环' : '跟随播放'}</span>
                )}
              </div>
              <div className="seg-row seg-wrap" role="group" aria-label="入场片段">
                {names.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`btn${name === clipName ? ' is-on' : ''}`}
                    onClick={() => onPatch({ clip: name, follow: false, solo: true, layer: 'entrance' })}
                    title={`只循环播放 ${name}，不拼接其它段（完整入场用下面的「播放完整入场」）· ${
                      state.entrance.clips[name] ? '已单独配置' : '未配置，按原始画布播放'
                    }`}
                  >
                    {name}
                    {state.entrance.clips[name] ? '' : ' ·'}
                  </button>
                ))}
                {!names.length && <span className="hint">先填好下面的入场序列</span>}
              </div>
              {names.length > 0 && (
                <p className="hint">
                  点某一镜 = 只循环播放这一段，方便单独看构图；想看拼接后的完整入场，点下面的「播放完整入场」。
                </p>
              )}
              {clipName && (
                <>
                  <div className="section-head">
                    <h3>{clipName} 的背景</h3>
                    {clip && (
                      <button type="button" className="btn btn-mini" onClick={() => replaceClip(null)}>
                        移除该段配置
                      </button>
                    )}
                  </div>
                  <BackdropSelect
                    label={`${clipName} 的背景`}
                    value={clip?.backdrop ?? ''}
                    options={options}
                    allowInherit
                    inheritHint={state.backdrop}
                    onChange={(backdrop) => patchClip({ backdrop })}
                  />
                  {!clip && (
                    <p className="hint">
                      这一段还没有自己的配置，按原始画布（1× 无偏移）播放。调下面任意一个滑块就会为它建一条。
                    </p>
                  )}
                </>
              )}
            </>
          )}

          <div className="section-head">
            <h3>调哪一层</h3>
          </div>
          <div className="seg-row" role="group" aria-label="图层">
            <button
              type="button"
              className={`btn${layerKey === 'backdrop' ? ' is-on' : ''}`}
              onClick={() => onPatch({ layerKey: 'backdrop' })}
            >
              背景
            </button>
            <button
              type="button"
              className={`btn${layerKey === 'model' ? ' is-on' : ''}`}
              onClick={() => onPatch({ layerKey: 'model' })}
            >
              人物
            </button>
          </div>

          {isEntrance && !clipName ? (
            <p className="hint">没有可调的片段。</p>
          ) : (
            <LayerFields
              title={`${layerKey === 'backdrop' ? '背景' : '人物'}（${
                isEntrance ? `${clipName || '入场'}${clip ? '' : ' · 未配置'}` : '构图'
              }）`}
              spec={activeSpec}
              design={design}
              onChange={patchActive}
            />
          )}

          {isEntrance && (
            <>
              <div className="section-head">
                <h3>过渡</h3>
              </div>
              <NumberRow
                label="段间渐变"
                value={state.entrance.blend}
                min={0}
                max={5}
                step={0.1}
                onChange={(blend) => onPatch({ entrance: { ...state.entrance, blend } })}
              />
              <p className="hint">
                单位秒。相邻两段之间、以及最后一段交回「构图」时都用它；0 = 硬切。
                最后一段开始后入场就结束：两层渐变回「构图（循环时）」，动画交回 `animation` 循环。
              </p>
            </>
          )}

          <div className="section-head">
            <h3>入场序列</h3>
          </div>
          <input
            className="full-input"
            type="text"
            value={state.sequence}
            aria-label="入场序列（英文逗号分隔，最后一段循环）"
            placeholder="cut_A, cut_B, loop_2"
            onChange={(event) => onPatch({ sequence: event.target.value, follow: false })}
          />
          <div className="seg-row">
            <button type="button" className="btn" onClick={onDetect} title="按动画名自动识别 cut_A / cut_B / loop_2">
              识别
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onReplay}
              disabled={!playingSequence.length}
              title="从头播放完整入场：按顺序拼接全部段，最后一段循环"
            >
              播放完整入场
            </button>
          </div>
          <p className="hint">
            最后一段只是「结束信号」：一播到它就把动画交回 `animation`、构图回到「循环时」，它自己的构图不生效——
            所以填待机的动画名，且这个名字不要在前面出现过，否则前面播到同名的段就直接结束了。
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={state.entrance.autoplay !== false}
              onChange={(event) =>
                onPatch({ entrance: { ...state.entrance, autoplay: event.target.checked } })
              }
            />
            启动时自动播放（全部立绘共用）
          </label>
          <p className="hint">
            勾选 = 壁纸加载完成后自动放一遍，右下角设置按钮上方还会多一个播放按钮，随时可以重放。
            不勾选 = 打开就是「构图（循环时）」，不出现播放按钮（这里的「播放完整入场」照样能用）。
            这个开关是全局的：它不属于某一套立绘，改一次全部立绘一起生效；上面的序列与逐段构图仍然各套独立。
          </p>
          <p className="hint">
            {soloing
              ? `当前只循环 ${clipName}（单段预览），不会拼接其它段。`
              : `实际播放：${playingSequence.length ? playingSequence.join(' → ') : '无（只循环单个动画）'}`}
          </p>

          <div className="section-head">
            <h3>动画</h3>
          </div>
          <span className="hint">循环动画（animation）· 切换立即在预览生效</span>
          <select
            className="full-select"
            value={state.animation ?? ANIM_AUTO}
            aria-label="循环动画"
            onChange={(event) => onPatch({ animation: event.target.value, follow: false })}
          >
            <option value={ANIM_AUTO}>自动（按 loop_2 → idle → loop 挑选）</option>
            <option value={ANIM_OFF}>禁用（不播任何动画）</option>
            {(animations ?? []).map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <span className="hint">表情（expression）· 通常选 face / _face 开头的那条</span>
          <select
            className="full-select"
            value={state.expression ?? ANIM_AUTO}
            aria-label="表情动画"
            onChange={(event) => onPatch({ expression: event.target.value, follow: false })}
          >
            <option value={ANIM_AUTO}>自动（挑第一个表情动画）</option>
            <option value={ANIM_OFF}>禁用（不叠表情轨道）</option>
            {(animations ?? []).map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
                {FACE_ANIM.test(item.name) ? ' · 表情' : ''}
              </option>
            ))}
          </select>
          <span className="hint">跳过开头（animationStart，秒）· 待机从第几秒开始播，用来跳过滑入等入场动作</span>
          <NumberRow
            label="起始秒数"
            value={state.animationStart ?? 0}
            min={0}
            max={10}
            step={0.1}
            onChange={(animationStart) => onPatch({ animationStart, follow: false })}
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={state.clickAnimation?.enabled === true}
              onChange={(event) =>
                onPatch({
                  clickAnimation: { ...(state.clickAnimation ?? { name: '' }), enabled: event.target.checked },
                })
              }
            />
            点击模型播放一次动作（clickAnimation）
          </label>
          {state.clickAnimation?.enabled === true && (
            <select
              className="full-select"
              value={state.clickAnimation?.name ?? ''}
              aria-label="点击动画"
              onChange={(event) =>
                onPatch({ clickAnimation: { ...state.clickAnimation, name: event.target.value } })
              }
            >
              <option value="">（未选择）</option>
              {(animations ?? [])
                .filter((item) => !FACE_ANIM.test(item.name))
                .map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
            </select>
          )}

          <div className="section-head">
            <h3>写回壁纸</h3>
          </div>
          <button
            type="button"
            className="btn full-btn"
            onClick={() => onCopy(buildConfigText(fileConfig, baseView, state, variantList, defaultVariant))}
          >
            复制完整配置
          </button>
          <p className="hint">
            {flash ||
              (fileConfig
                ? '已按 wallpaper.config.json 的键顺序生成，整份替换该文件即可。'
                : '没读到 wallpaper.config.json，复制出来的只有构图相关的几项。')}
          </p>
        </>
      )}
    </div>
  )
}
