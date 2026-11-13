# 实现要点

## Spine 技术坑

- runtime 锁在 **4.1.x**：本游戏 skel 由 Spine 4.1.11 导出，3.8 的 runtime 解析不了。
- `drawSkeleton(skeleton, false)`：BD2 图集**没有**预乘 alpha，第二位传 `true` 会让大面积半透明叠加被白板盖住。
- 角色立绘只播 `idle` 会得到白脸，五官由 `_faceN` 附件动画在轨道 1 提供；查看器会自动挑一条。
- 多页图集是 `_2.png` … `_N.png` 独立文件，atlas 页名必须与磁盘文件名一致。
- 背景候选里带 `-N` / `_N` 后缀的是局部遮罩、`*move` 是低清版，界面会归到「不推荐」。
- 当前 7 套 cutscene 模型全部是 Spine 4.1.11，动画命名有 `cut_A`/`cut_B` 与 `A_cut`/`B_cut` 两种混用；
  每套都有 `loop_2`，查看器默认选它（与 `loop` 是两条互斥姿势线，不要混着播）。

## 架构约定

- 两个页面共用同一个 `SpineStage`；`fitRatio` / `interactive` / `showLoading` / `design` 是壁纸页专用的
  可选 props，默认值保持调试页行为不变，不会出现两套 WebGL / 资源加载逻辑。`design` 模式下取景改用
  `useSpineAsset` 冻结的 `setupBounds`（调试页仍用动画姿态包围盒）。
- 扫描器会读 PNG 的 IHDR，把背景图原生 `width`/`height` 写进 manifest；壁纸基准在构建期就确定，
  不依赖浏览器里 `Image.onload` 的异步时机。
- 两层变换都由 `resolveLayerTransform()` 解析成设计坐标元组后分两路应用：背景走 CSS transform，
  模型走 `design.transform` 进相机（入场渐变期间改由 `design.transformRef` 逐帧提供）；canvas 自身不加 CSS transform，
  否则 `k = 位图宽 / 设计宽` 会失效。
- WallKit 浮层与构图**完全解耦**：它渲染在 `.wallpaper-design` 之外的独立层里，用视口锚点定位，
  不读 `design` / `fit` / `scale`。数据 hooks 分散在各控件组件内，只开时钟时不会订阅音频帧。

## 构图数学

- `src/lib/composition.js` 是设计画布构图几何的**唯一来源**（`compositionRects()` / `normalizeRect()` 等），
  无 DOM 依赖，可直接在纯 Node 里 import 复算。壁纸与调试页共用。
- `src/lib/backdrops.js` 与 `src/lib/animation.js` 是两个 feature 共用的纯函数（背景挑选、入场序列识别）。
- `src/lib/assets.js` 模块顶层读 `import.meta.env.BASE_URL`，Node 里 import 会炸，所以背景挑选单独放 `backdrops.js`。
- 相机数学的核心：`k = canvas.width / design.width` 反解设计坐标到屏幕；模型/画布归一化矩形与
  scale、dpr、屏幕比例无关，可用纯 Node 复算验证。

## 壁纸页设置抽屉细节

（详见 `src/features/wallpaper/components/` 源码注释，此处只列关键约束）

- 抽屉默认 `visibility: hidden`，不参与 Tab 焦点；`S` / 手柄打开、`Esc` / × 关闭。
- 编辑只改页面内存状态，绝不写回 `config.js`；唯一出口是「记录配置」写 `localStorage['wallpaper.config.user']`。
- WE 的 CEF 宿主里不能用 `<select>` / `input type="color"` / `alert` / `confirm` / `prompt`（OS 级弹窗会崩壁纸窗口），
  所以抽屉里用「按钮组 + 页面内取色面板」，且没有任何可输入框（WE 不把键盘焦点交给壁纸窗口）。
- 抽屉必须一屏放得下（WE 无滚轮），字段按两列一排排布，抽屉宽度 `440px` 基准再乘 `--ui-scale`。
- 面板外包 `SettingsBoundary`：渲染抛错只隐藏面板，壁纸继续跑。
- 界面缩放：所有 chrome 尺寸写 `calc(<n>px * var(--ui-scale))`，`--ui-scale` 由 `lib/uiScale.js` 按视口算
  （1080p = 1，夹在 `0.85–2.4`），1px 描边不参与缩放。
