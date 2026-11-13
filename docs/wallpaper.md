# 壁纸与构图

首页会自动给当前模型配**它自己的背景**：扫描器按文件名里的 6 位角色 ID 关联背景库，
从中挑分辨率最高的「完整场景」（`-N` 分片、`*move` 低清、特效层会被排除）。改 `modelId` 就会自动换成
那个角色的背景。例如默认 `Iron Monarch` 用 `char067601_back1.png`（王座厅，**2048×2048**），
而不是 1024² 的 `back2`。

## 基准怎么定

`skel.width/height` 只是 setup pose 的包围盒尺寸，**不是**设计分辨率；背景图又都是 1:1 场景插画。
因此把**对应背景图的原生像素尺寸**当作固定设计画布（design canvas）：

```
固定设计画布（例如 2048×2048）
├─ 背景 <img>     原生 1:1 铺满画布、不拉伸（未应用背景层变换时）
└─ WebGL <canvas> 同一尺寸，按冻结的 setupBounds + 构图比例放置模型
        ↓ 整块画布只用一个 scale 等比缩放并居中
真实屏幕（任意分辨率 / 任意宽高比）
```

- 背景和模型是**同一个容器的子元素，共用同一个 CSS transform**：屏幕尺寸或比例变化只改变这一个
  `scale`，容器内部的相对尺寸与相对位置恒定不变。
- 模型取景用**加载时冻结的 setup pose 包围盒**，不会随动画播放或 `fit` 重算而漂移。
- 相机用 `k = 画布位图宽 / 设计画布宽` 这唯一因子把设计坐标映射到屏幕，背景 `<img>` 与它同源，因此始终对齐。
- `canvas` 位图分辨率按 CSS transform 之后的**实际显示尺寸**渲染，高分屏 / 放大时不会糊。
- `fit: 'contain'` 保证完整构图（其它比例留边）、`'cover'` 铺满并对称裁切；**两者都不改变相对构图**。
  留边默认用同一张背景的模糊放大版填充（纯装饰层，不参与构图）。

`src/features/wallpaper/config.js` 里的 `WALLPAPER` 是**内置默认值**（也是配置文件的兜底），
`public/wallpaper.config.json` 是**可外部修改的运行期配置**，字段与它一一对应：

| 字段 | 说明 |
| --- | --- |
| `modelId` | 固定模型 id（`npm run model:list` 可查）；精确 → 部分 → 第一个模型兜底 |
| `backdrop` | `'auto'` 自动选对应最高分辨率完整场景；`'none'` 关闭；也可写 `'back2'` / 完整文件名指定 |
| `design` | `null` = 用该背景的原生像素尺寸作基准（推荐）；也可写死 `{ width: 2048, height: 2048 }` |
| `fit` | `'contain'` 完整构图 / `'cover'` 铺满裁切 |
| `letterbox` / `bleed` | 留边颜色；是否用同图模糊延展填充留边 |
| `overscan` | 渲染面相对设计画布的倍数（默认 `1.5`），避免在画布矩形上出现硬直边 |
| `model.heightRatio` / `widthRatio` | 模型 setup 包围盒相对设计画布的高度 / 宽度上限（默认 `1`） |
| `model.alignX` / `alignY` | 模型中心在设计画布内的位置 0..1（默认 `0.5` 居中） |
| `backdropTransform` | 背景层独立 `{ scale, offsetX, offsetY }` |
| `modelTransform` | 模型层独立 `{ scale, offsetX, offsetY }`，与背景层语义完全相同 |
| `parallax` | 鼠标视差：`{ enabled, backdrop, model }`，强度是设计画布百分比，正值跟随鼠标方向、`0` 不动 |
| `animation` / `expression` | `null` 自动挑（`loop_2` / 首个 `_faceN`）；字符串指定；`''` 关闭该轨道 |
| `sequence` | 入场序列：按顺序各播一次、最后一个循环的动画名数组；`"auto"` 按模型动画名识别 |
| `entrance` | 入场按段构图 + 是否自动播放：`{ autoplay, blend, clips }` |
| `skin` / `speed` / `zoom` | 皮肤、倍速、固定构图之上的额外缩放 |
| `overlay` | WallKit 控件浮层（`accent` + 五组控件），详见 [wallkit.md](wallkit.md) |

## 配置文件：成品也 = 出厂默认值

`public/wallpaper.config.json` 会被原样复制到 `dist/` 根目录（与 `index.html` 同级、**文件名不带 hash**），
页面启动时 `fetch` 它并**深度合并**到内置默认值之上。所以打包之后调整构图不需要重新构建：

1. 打开 `dist/wallpaper.config.json`，改任意字段（例如把 `backdropTransform.scale` 从 `1.5` 改成 `1`）；
2. 刷新页面即生效。开发时改 `public/wallpaper.config.json` 同样刷新即可。

但请注意它是**出厂默认值**：一旦用户在抽屉里点过「记录配置」，启动时就是「内置默认值 →
`wallpaper.config.json` → **用户记录**」——记录在最上面，文件和它冲突的地方全部被记录盖掉。
所以改文件只对「还没记录过的第一次打开」「点过恢复首次默认」「宿主清空了该壁纸存储」这三种情况生效；
想让自己手上的壁纸立刻变，用抽屉里的「恢复首次默认」，或者直接在抽屉里改完再「记录配置」。

合并规则：文件里省略的字段沿用内置值，`_` 开头的键（如 `_readme`）只当注释被忽略，未知键会原样保留；
记录是**完整文档**，所以它会把当时每个字段（哪怕等于内置值）一起盖上去——这是刻意的，用户说「按我记录的来」
就该原样复现。记录里没有的键（新版本才加的）仍然取文件 / 内置的值。

注意事项：

- `file://` 直接打开 `dist/index.html` 时浏览器禁止 fetch 本地 JSON，会**退回内置默认值**，console 有一条 warning。
  需要读配置文件请用 `npm run preview` 或任意静态服务器。
- 记录存在 `localStorage['wallpaper.config.user']`（`{ at, config }`，是整个配置对象而不是字符串）。
- 配置值不做严格校验，写错类型会原样进入渲染。
- 想扩展新设置：JSON 里直接加键即可（会被保留），但要真正生效还需要在代码里读取它。
- 抽屉标题下会显示当前配置来源：蓝色 = 用户记录，绿色 = 配置文件，橙色 = 内置默认值。

## 两层独立调整：单位决定结果是否固定

背景和模型可以各自缩放、各自平移，两者互不影响；`resolveLayerTransform()` 把配置统一解析成
**设计画布坐标**下的 `{ scale, dx, dy }`，背景用 CSS `translate(dx,dy) scale(s)`（中心为原点），
模型则把同一个元组送进相机数学（`worldZoom / s`、相机目标加 `dx/dy * k`）。平移不会被该层的缩放放大。

| 写法 | 单位 | 跨设备是否固定 |
| --- | --- | --- |
| `scale: 2` | 相对该层自身基准的倍率 | ✅ 固定 |
| `offsetX: 100` / `offsetY: -60` | **设计画布像素** | ✅ 固定 |
| `offsetX: '10%'` | 相对**设计画布宽**（Y 相对设计画布高） | ✅ 固定 |
| 屏幕 CSS 像素 / `vw` / `vh` / 相对视口的百分比 | 随 `scale` 或宽高比变化 | ❌ 不固定 |

只要用前三种单位，两层都被关在同一个设计画布里，最终只乘一个 `designScale`：
**任意分辨率、任意宽高比、DPR、contain/cover 下，背景与模型的相对矩形完全恒定**。

离线复算（纯 Node）覆盖 7 种视口 × DPR 1/2 × contain/cover 共 28 组 × 4 种配置 = 112 组，
相机实际结果与配置预测的最大偏差为浮点误差量级（~2e-16）。
`compositionRects()` / `normalizeRect()`（在 `src/lib/composition.js`，壁纸与调试页共用）是这套计算的唯一来源。

**设计画布本身不裁剪两层**：背景与模型都可以平移 / 放大到画布之外（`overscan`，默认 `1.5×` 的渲染面），
超出屏幕的部分由视口裁切。

## 入场序列与按段构图

BD2 的过场不是一段动画，而是**一串镜头**：`cut_A → cut_B → loop_2`，每段有自己的背景、镜头位置和大小。
所以构图也是**按段配置**的，播放时拼起来，而不是共用一组数：

```json
"entrance": {
  "autoplay": true,
  "blend": 0.9,
  "clips": {
    "cut_A":  { "backdrop": "", "backdropTransform": { … }, "modelTransform": { … } },
    "cut_B":  { "backdrop": "", "backdropTransform": { … }, "modelTransform": { … } },
    "loop_2": { "backdrop": "", "backdropTransform": { … }, "modelTransform": { … } }
  }
}
```

- `autoplay`（默认 `true`）= 壁纸加载完成后自动放一遍，并多一个圆形播放按钮；设成 `false` 则打开就是静止画面。
- 键就是**动画名**。`backdrop` 是该段自己的背景图（`''` = 跟随全局 `backdrop`）。
- 某一段**没有条目**时按原始画布播（`1×`、无偏移）。
- 段与段之间用 `blend` 秒交叉淡入。**最后一段开始的那一刻入场就结束了**：两层缓动回
  `backdropTransform` / `modelTransform`，同时把 track 0 交还给 `animation` 循环。
- 换背景只换 `<img>` 的图，**设计画布始终跟着全局 `backdrop`**，各段用到的背景在启动时就预加载了。
- 渐变只写两个既有通道（背景 CSS 变量 `--backdrop-*`、模型 `transformRef`），**不进 React state**。
- 入场（最后一段之前）期间鼠标视差自动关闭。

数值不要在壁纸抽屉里硬调：打开 `/spine-viewer` → 「构图」tab，勾上「固定设计画布预览」，
选「入场（按段）」→ 点某一段 → 调这一段的背景与两层缩放 / 偏移，调好点「复制完整配置」整份替换
`public/wallpaper.config.json`。面板会自动读取现有配置文件作为起点。注意它读的是**文件（出厂默认）**，
不是壁纸抽屉里「记录」的那份。

点某一镜时舞台**只循环播放这一镜**（标题旁显示「单段循环」），方便单独抠这一段的构图；
要验证拼接与接缝，点「播放完整入场」从头放完整序列。

## 壁纸页其它说明

- 壁纸页默认**没有任何 UI**：不响应滚轮 / 拖拽 / 双击。播放内容 = `sequence` 入场序列，`sequence` 为空则只循环 `animation`。
- 唯一的两类 chrome：右下角半透明手柄（构图齿轮 + 播放按钮），`Esc` / × 关闭抽屉。
- 只有加载失败或素材库为空时，左下角才出现一行纯文本错误。
- 开发时可用 `/?model=<id 片段>` 临时换模型及其对应背景对比。
- 路由刻意不引入 react-router：只有两个页面，`base: './'` 让 `dist/` 可直接通过 `file://` 或任意子路径打开。
