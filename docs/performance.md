# 性能笔记：入场运镜卡顿排查

> 2026-11-16 记录。一次「只有运镜掉帧、静止构图不卡」的性能问题排查与修复。
> 代码事实以源码为准：`lib/spine/SpineStage.jsx`、`features/wallpaper/WallpaperPage.jsx`。
>
> **相关提交**：
> - 运镜功能实现：`208e715` feat(composition): per-clip camera moves (PV-style pan/zoom)
> - 卡顿修复（本文）：`69d5ee7` fix(wallpaper): stop rebuilding the WebGL buffer on every camera frame

## 1. 现象

- **只有运镜掉帧**：入场序列播放 camera move（PV 式推拉/平移）时明显卡顿、顿挫。
- **镜头切换更卡**：`cut_A → cut_B` 的 cross-fade 那一瞬（zoom 骤变）掉帧最严重。
- **静止构图完全不卡**：没有运镜时 60fps 稳定。
- 环境：浏览器 dev 页（壁纸路由 `/`），已排除"未重新构建"的因素。

## 2. 排查过程（两次误判 + 一次命中）

### 2.1 第一次假设：每帧同步 reflow（次要，非主因）

`WallpaperPage.handleSequenceFrame` 原来每帧做：

```js
const cx = (Number(el.style.width) || 0) / 2   // 每帧读回 layout
const cy = (Number(el.style.height) || 0) / 2
el.style.transform = transform                   // 紧接着写
```

读 `el.style.width` 会强制一次同步布局（reflow）。这确实是问题，但**不是主因**——
修掉后（改用常量 `design.width/2`）用户反馈"还是卡"。注意：viewer 的对应代码
`ViewerPage.handleSequenceFrame` 用的本来就是 `host.width`（从 ref 发布的常量），
所以 viewer 没有这个 reflow，反证了 reflow 不是唯一根因。

### 2.2 命中：每帧重建 WebGL drawing buffer（主因）

`SpineStage` 渲染循环里，渲染分辨率这样算：

```js
const rect = canvas.getBoundingClientRect()                    // 含 transform
const displayScale = Math.max(rect.width / cssWidth, ...)      // 显示/布局比
const width  = Math.round(cssWidth  * Math.min(dpr * displayScale, 3 / overscan))
if (canvas.width !== width) { canvas.width = width; gl.viewport(...); ... }
```

关键点：`getBoundingClientRect().width` **包含了 CSS transform**。而壁纸的运镜是
在 `.wallpaper-design` 元素上逐帧写 `transform`（`translate3d + scale3d`），所以：

```
运镜 → .wallpaper-design transform 每帧变
     → canvas.getBoundingClientRect().width 每帧变
     → displayScale 每帧变 → canvas.width/height 每帧变
     → 每帧重建 WebGL drawing buffer + 重置 viewport
```

**给 canvas 赋一个新的 `width` 会触发整个 WebGL drawing buffer 的重新分配**，这是
WebGL 里最贵的操作之一，远贵于一次 reflow。而且 zoom 越大缓冲越大（`width×height×dpr`
像素），重建越贵——这正好解释了"镜头切换（zoom 骤变）最卡"。

本质：**运镜的临时 zoom 被错误地折进了渲染分辨率**。渲染分辨率本应只由"静态构图
缩放 `scale(k)`"决定（决定画布用多高分辨率画），而运镜 zoom 是"临时放大显示"，
应由 GPU 合成器（compositor）完成，不该驱动 drawing buffer 重建。

## 3. 修复

### 3.1 `SpineStage.jsx`：displayScale 改用静态 scale

新增对 `design.displayScaleRef` 的读取，渲染分辨率只用静态构图缩放：

```js
const displayScaleRef = d?.displayScaleRef?.current
const displayScale = displayScaleRef > 0
  ? displayScaleRef
  : (() => { const rect = canvas.getBoundingClientRect(); return ... })()  // 兜底
```

- 运镜期间 `scale(k)` 恒定，`canvas.width/height` 不再变化，**缓冲零重建**；
  运镜 zoom 完全交给 CSS 合成器。
- 调用方没传 ref 时（debug viewer 非构图模式）回退旧 `getBoundingClientRect` 逻辑，
  行为不变，向后兼容。

### 3.2 `WallpaperPage.jsx`：传入静态 scale + 去掉 reflow

- 新增 `displayScaleRef = useRef(1)`，每次渲染 `displayScaleRef.current = scale`
  （`scale = designScale(design, viewport, fit)`，即静态构图缩放），并把 ref 塞进
  `stageDesign`（传给 `SpineStage` 的 `design`）。
- `handleSequenceFrame` 的 `cx/cy` 改用常量 `design.width/2`、`design.height/2`，
  删除每帧的 `el.style.width/height` 读；transform 从 `scale()` 统一成
  `translate3d()/scale3d()`，稳定走合成层。

> 以上修复整体落在 commit `69d5ee7`；运镜功能本体在 commit `208e715`。

## 4. 权衡与遗留

- **代价**：运镜放大到 >1× 时，canvas 渲染分辨率不再随 zoom 提升，画面会略糊。
  因为是运动画面通常难以感知，静止构图不受影响。已与用户确认可接受。
- **遗留**：viewer 的 compose 运镜预览（`/spine-viewer` 构图页）没传
  `displayScaleRef`，仍走旧路径，运镜预览理论上还有同样的每帧重建。调试页可接受，
  如需一并修，给 `CompositionStage`/`ViewerPage` 同样接上静态 `scale` 即可。
- 若日后要求"放大清晰度"与"不重建缓冲"兼得，可考虑：只在运镜**开始/结束**各
  重建一次（用起止 zoom 决定分辨率），中间冻结——复杂度更高，暂不必要。

## 5. 通用结论

> 任何"每帧往 canvas 上写会变尺寸"的路径，只要依赖了会随动画变化的几何量
> （`getBoundingClientRect`、含 transform 的尺寸），就会把 WebGL drawing buffer
> 拖进每帧重建的坑。渲染分辨率应只由**静态**的显示倍率决定，动态缩放交给
> compositor，而不是 buffer。
