# browndust2-model-viewer

《棕色尘埃2》（BrownDust 2）的 **Spine 壁纸 / 模型查看器**：React 18 + Vite 5 + `@esotericsoftware/spine-webgl@4.1.56`。
直接读取仓库里的 `model-library/`，不依赖 Wallpaper Engine 也能跑；壁纸页可选叠加
[WallKit](https://github.com/mikoberry/wallkit) 的控件浮层（时钟 / 频谱 / 专辑卡 / 氛围粒子 / 指针特效），
接上 Wallpaper Engine 后频谱与专辑卡会拿到真实的音频 / 媒体数据。

两个路由，用途完全分开：

| 路径 | 用途 | 页面内容 |
| --- | --- | --- |
| `/`（以及其它所有路径） | **壁纸**：正式页面 | 全屏固定模型 + 对应背景；默认零 UI，仅右下角一个可忽略的构图设置手柄（另有配置控制的 WallKit 控件浮层） |
| `/spine-viewer` | **开发调试辅助页** | 完整查看器：模型库、工具栏、动画 / 信息面板、时间轴、状态栏 |

### 壁纸设置抽屉（壁纸页）

右下角手柄 / `S` 键展开。顶部是**主题色**（三类特效共用），下面用 tab 分组：
**构图 · 时钟 · 频谱 · 专辑卡 · 氛围 · 指针**——最后一组是 WallKit 控件，每个控件一个 tab，
tab 上带小圆点表示该控件当前已开启。

「构图」tab 里是「背景」「模型」两组，各含**缩放**、**水平偏移**、**垂直偏移**，外加一组「鼠标视差」：

- 滑块两端各有一个 `-` / `+` 按钮，点一下走一个步进（缩放 `0.01`，偏移 `1` 设计像素），用来做鼠标拖不准的微调；
  缩放范围 `0.25×–3×`，偏移范围 ±一整块设计画布（宽屏上要拖到留边区需要接近这个量级），
  读数同时给出**设计像素**与**百分比**。
- 「鼠标视差」= 一个总开关 + 背景 / 人物两个强度（`-20%`–`20%`，步进 `0.5`）。强度按**设计画布百分比**算，
  **正值与鼠标同方向**（鼠标移到左上，图层也往左上走），**负值反向**，`0` 表示该层不动；人物默认 `2%`、
  背景默认 `0%`。指针移出画面或窗口失焦时自动滑回原位，指针停在正中时两层正好回到构图位置。
  视差在设计坐标里算，因此在任何分辨率 / DPR / `fit` 模式下偏移比例都一样；它只改绘制位置，不改构图基准。
- 编辑结果实时作用到两层（背景走 CSS transform，模型走相机），不重建 WebGL，也不影响动画播放。
- 每组可单独「重置」，底部「全部重置」回到当前配置文件的默认值；「记录配置」把**完整配置**（其它字段原样 +
  当前两层的缩放/偏移 + 控件设置）序列化成 `wallpaper.config.json` 的内容，**同时**写进 `localStorage` 的
  `wallpaper.config.record`（`{ at, text }`）和剪贴板；状态行会显示「已记录 · 已复制」与时间，
  下次打开抽屉还能看到「上次记录 19:52:07」。可直接整文件替换剪贴板里的内容。

控件 tab 里改的是各自的**启用开关 / 尺寸 / 位置（3×3 锚点 + 两个偏移）/ 颜色**，以及自己的属性
（时钟的布局、文字色、倾斜、节拍响应；频谱的样式、宽高覆盖、强度曲线；专辑卡的布局与文字色；
氛围的形态、密度；指针的拖尾 / 点击形态与强度）。位置用**视口百分比**，与构图的画布像素是两套单位。
面板只在壁纸页存在；抽屉关闭时 `visibility: hidden`，不参与 Tab 焦点；所有改动只活在当前页面。

面板里**没有原生下拉框和原生取色器**：风格 / 布局之类的枚举是**一排按钮**（选中项高亮，悬停显示库里的
原名，如 `cyberpunk`）；颜色是「色块按钮 + 十六进制读数」，点色块在字段下方展开一个**页面内取色面板**
（饱和度/亮度方块 + 色相条，拖动即时生效，再点一次收起）。这不是审美选择——WE 的 CEF 宿主里
`<select>` 的下拉列表和 `input type="color"` 的系统配色框都是 OS 级弹窗，一旦弹出会把整个壁纸窗口带崩。
同理也不要用 `alert` / `confirm` / `prompt`。调试页（`/spine-viewer`）不在此列，它只在浏览器里用，仍保留原生下拉。

**抽屉里没有任何可输入的框**：WE 不会把键盘焦点交给壁纸窗口，文本框点得开却敲不进去。所有数值都是
「读数 + `-` / `+` 步进按钮」：滑块两侧各一个按钮（步进即该字段的 `step`），频谱的宽度 / 高度这类 CSS 长度
用 `LengthField`（中间显示 `100vw` 这样的当前值，单位沿用配置里的写法，右侧「自动」清空回「由尺寸决定」）。

抽屉**必须一屏放得下**：WE 里没有鼠标滚轮，`.ws-body` 的滚动条实际上没法用，所以每个 tab 的字段都按
「两列一行」排（`.ws-pair`；位置行是 `.ws-pair.is-position`：左边 3×3 锚点跨两行，右边竖排两个偏移滑块），
抽屉宽度 `440px`（基准 1080p，
再乘 `--ui-scale`）。加新字段时优先找能并排的伙伴，实在放不下再往下堆——滚动条只是兜底。

抽屉外面还包了一层 `SettingsBoundary`：面板渲染抛错时只是隐藏面板并把错误打到 console，
壁纸本身继续跑；关掉再按 `S` 会重新尝试渲染。

**界面缩放**：抽屉与手柄的每个尺寸（字号、内边距、控件高度、抽屉宽度）都写成
`calc(<n>px * var(--ui-scale))`，`--ui-scale` 由 `src/lib/uiScale.js` 按视口算出
（`min(宽/1920, 高/1080)`，夹在 `0.85–2.4`）：1080p = 1，2K = 1.33，4K = 2。
所以同一份 CSS 在 2K 屏上不会显得「字只有一半大」，换显示器也不用手改字号。
1px 描边故意不参与缩放（保持一像素细），壁纸画面本身（模型 / 背景）完全不受影响。

根路由显示的模型、背景、构图与播放参数由两个地方决定：**内置默认值**在
`src/features/wallpaper/config.js`，**运行时实际值**来自随页面发布的 `wallpaper.config.json`
（见下文「配置文件」）。改动都不会影响调试页。

## 运行

```bash
npm install
npm run dev          # 根地址 = 壁纸；地址后加 /spine-viewer 进调试页
npm run build        # 产出 dist/
npm run build:we     # 打包 + 部署到 Wallpaper Engine 项目目录（见下节）
npm run preview      # 预览构建产物
npm run model:list   # 命令行查看 model-library 扫描结果
```

开发时直接访问 `http://localhost:5173/spine-viewer`。调试页标题右侧有「← 壁纸首页」可跳回；
壁纸页刻意不放任何跳转入口，需要手动改地址栏。

## 部署到 Wallpaper Engine

```bash
npm run build:we     # = vite build + scripts/deploy-weproject.mjs
npm run deploy:we    # 只复制现有 dist/，不重新构建
```

目标目录默认是
`F:\SteamLibrary\steamapps\common\wallpaper_engine\projects\myprojects\BD2-test`，
可以用环境变量覆盖：`WE_PROJECT=D:/somewhere npm run deploy:we`（`WE_TITLE` 改工程标题）。

脚本做的事情，顺序固定：

1. 清掉目标目录里 **由构建产出** 的三项（`assets/`、`models/`、`index.html`），其它文件一概不动；
2. 把 `dist/` 整个复制过去，**包括 `wallpaper.config.json`**：部署目录是 `dist/` 的镜像，
   每次部署都会覆盖。所以调参要在仓库里改 `public/wallpaper.config.json`（或在抽屉里调好后点「记录配置」
   粘回去），不要直接改部署目录那份——它下次就没了；
3. 生成 `project.json`：`file: index.html`、`type: "Web"`、
   `general.supportsaudioprocessing: true`（频谱 / 专辑卡要用），
   目录里若有 `preview.gif|jpg|png` 会自动登记为缩略图——放一张进去再部署即可；
4. 打印文件数与体积。

部署完在 Wallpaper Engine 里「打开壁纸」选该目录就能预览（它是普通 `web` 工程，不是场景工程）。
`supportsaudioprocessing` 只能在 `general` 内部；`type` 用大写 `Web`。这两条写错的表现是
「监听器注册了但一次回调都没有」，症状很容易误判成组件问题。

注意：如果 WE 以 `file://` 打开页面，`fetch('wallpaper.config.json')` 会被拦掉并**退回内置默认值**
（console 有一条 warning，抽屉标题下显示橙色「内置默认值」）。要确认配置真的生效，
可以直接在 WE 调试控制台看这个值是不是 `file`：`fetch('./wallpaper.config.json').then(r => r.ok)`。

## 壁纸（根路由）：对应背景 + 固定构图

首页会自动给当前模型配**它自己的背景**：扫描器按文件名里的 6 位角色 ID 关联背景库，
从中挑分辨率最高的「完整场景」（`-N` 分片、`*move` 低清、特效层会被排除）。改 `modelId` 就会自动换成
那个角色的背景。例如默认 `Iron Monarch` 用 `char067601_back1.png`（王座厅，**2048×2048**），
而不是 1024² 的 `back2`。

### 基准怎么定

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
| `design` | `null` = 用该背景的原生像素尺寸作基准（推荐）；也可写死 `{ width: 2048, height: 2048 }` 让所有模型共用一个基准 |
| `fit` | `'contain'` 完整构图 / `'cover'` 铺满裁切 |
| `letterbox` / `bleed` | 留边颜色；是否用同图模糊延展填充留边 |
| `overscan` | 渲染面相对设计画布的倍数（默认 `1.5`）。两层画在放大后居中渲染面上，视口负责裁剪，避免在画布矩形上出现硬直边；不影响缩放 1× 时的构图 |
| `model.heightRatio` / `widthRatio` | 模型 setup 包围盒相对设计画布的高度 / 宽度上限（默认 `1`） |
| `model.alignX` / `alignY` | 模型中心在设计画布内的位置 0..1（默认 `0.5` 居中；`alignY: 0.7` 可让立绘偏下） |
| `backdropTransform` | 背景层独立 `{ scale, offsetX, offsetY }`，单位见下一节 |
| `modelTransform` | 模型层独立 `{ scale, offsetX, offsetY }`，与背景层语义完全相同 |
| `parallax` | 鼠标视差：`{ enabled, backdrop, model }`，两个强度是**设计画布百分比**，正值跟随鼠标方向、负值反向、`0` 不动（默认 `enabled: true` / 背景 `0` / 人物 `2`） |
| `animation` / `expression` | `null` 自动挑（`loop_2` / 首个 `_faceN`）；字符串指定；`''` 关闭该轨道 |
| `skin` / `speed` / `zoom` | 皮肤、倍速、固定构图之上的额外缩放 |
| `overlay` | WallKit 控件浮层：`accent` 主题色 + `clock` / `spectrum` / `albumArt` / `ambient` / `pointer` 五组，各自 `enabled`，详见下文「控件浮层」 |

### 配置文件：打包后也能直接改

`public/wallpaper.config.json` 会被原样复制到 `dist/` 根目录（与 `index.html` 同级、**文件名不带 hash**），
页面启动时 `fetch` 它并**深度合并**到内置默认值之上。所以打包之后调整构图不需要重新构建：

1. 打开 `dist/wallpaper.config.json`，改任意字段（例如把 `backdropTransform.scale` 从 `1.5` 改成 `1`）；
2. 刷新页面即生效。开发时改 `public/wallpaper.config.json` 同样刷新即可。

合并规则与优先级（后者覆盖前者）：**内置默认值 → `wallpaper.config.json` → 抽屉里的临时调整**。
文件里省略的字段沿用内置值，`_` 开头的键（如 `_readme`）只当注释被忽略，未知键会原样保留。

当前文件的默认值里把**背景层缩放设成了 `1.5`**（模型层保持 `1`），这样背景略微超出画布、更接近铺满；
想改模型就改 `modelTransform.scale`。

注意事项：

- `file://` 直接打开 `dist/index.html` 时浏览器禁止 fetch 本地 JSON，会**退回内置默认值**，console 有一条 warning。
  需要读配置文件请用 `npm run preview` 或任意静态服务器。
- 配置值不做严格校验，写错类型会原样进入渲染，改之前先对照上面的字段表。
- 想扩展新设置：JSON 里直接加键即可（会被保留），但要真正生效还需要在代码里读取它。
- 抽屉标题下会显示当前默认值来源：绿色 = 已读到配置文件，橙色 = 用的是内置默认值。

### 两层独立调整：单位决定结果是否固定

背景和模型可以各自缩放、各自平移，两者互不影响；`resolveLayerTransform()` 把配置统一解析成
**设计画布坐标**下的 `{ scale, dx, dy }`，背景用 CSS `translate(dx,dy) scale(s)`（中心为原点），
模型则把同一个元组送进相机数学（`worldZoom / s`、相机目标加 `dx/dy * k`）。平移不会被该层的缩放放大。

| 写法 | 单位 | 跨设备是否固定 |
| --- | --- | --- |
| `scale: 2` | 相对该层自身基准的倍率 | ✅ 固定 |
| `offsetX: 100` / `offsetY: -60` | **设计画布像素**（当前 2048² 基准下的 100px） | ✅ 固定 |
| `offsetX: '10%'` | 相对**设计画布宽**（Y 相对设计画布高） | ✅ 固定 |
| 屏幕 CSS 像素 / `vw` / `vh` / 相对视口的百分比 | 随 `scale` 或宽高比变化 | ❌ 不固定 |

只要用前三种单位，两层都被关在同一个设计画布里，最终只乘一个 `designScale`：
**任意分辨率、任意宽高比、DPR、contain/cover 下，背景与模型的相对矩形完全恒定**。
例如两层都 `scale: 2, offsetX/Y: 100`，在 1920×1080 与 3840×2160 上得到的归一化构图都是
`背景 [0.54883, 0.54883, 2, 2]` / `模型 [0.54883, 0.54883, 1.58490, 2]`。

反例：如果 `100` 被当成屏幕像素，1920×1080 上它等于 189.6 设计 px（归一化 0.09259），
3840×2160 上只等于 94.8 设计 px（归一化 0.04630）—— 分辨率翻倍，相对偏移就减半。
**所以配置里不要写屏幕像素或 `vw/vh`。**

离线复算（纯 Node，不需要构建或浏览器）覆盖 7 种视口 × DPR 1/2 × contain/cover
共 28 组 × 4 种配置 = 112 组，相机实际结果与配置预测的最大偏差为浮点误差量级（~2e-16）。
`compositionRects()` / `normalizeRect()` 是这套计算的唯一来源，可用于写测试。
留边模糊层 `bleed` 是纯装饰，不参与构图。
**设计画布本身不裁剪两层**：背景与模型都可以平移 / 放大到画布之外（`overscan`，默认 `1.5×` 的渲染面），
超出屏幕的部分由视口裁切——以前裁在画布边界上，往留边区拖背景会被「切掉」，看起来像拖不过去。

### 壁纸页其它说明

- 壁纸页默认**没有任何 UI**：没有侧栏、工具栏、检查器、时间轴、状态栏、加载动画，也不响应滚轮 / 拖拽 / 双击；固定循环播放。
- 唯一的两类 chrome：右下角一个半透明的**构图设置手柄**（默认 `opacity: .25`，悬停显形；点击或按 `S` 展开**壁纸设置抽屉**：
  顶部主题色 + 「构图 / 时钟 / 频谱 / 专辑卡 / 氛围 / 指针」六个 tab。构图 tab 调背景 / 模型的缩放与偏移，
  控件 tab 调各自的启用、尺寸、位置、颜色与专有属性；`Esc` 或 × 关闭。改动只影响当前页面，**不会写回配置文件**——
  调好后点「记录配置」，得到的就是一份完整的 `wallpaper.config.json`（同时存进浏览器存储），覆盖同名文件（或粘进 `config.js` 的内置默认值）刷新即可），
  以及配置里开启的 **WallKit 控件浮层**（默认只开一个时钟）。
- 只有加载失败或素材库为空时，左下角才出现一行纯文本错误（同时打到 console）。
- 调试页「信息 → 文件列表」会显示每张背景的原生尺寸，方便核对基准。
- 开发时可用 `/?model=<id 片段>` 临时换模型及其对应背景对比，不传参数就是配置里的固定组合。
- 路由刻意不引入 react-router：只有两个页面，且 `base: './'` 让 `dist/` 可以直接通过 `file://`
  或任意子路径被壁纸引擎加载。判断规则是「路径最后一段是 `spine-viewer`（或 `#spine-viewer` / `?viewer`）」，
  其余一律落到壁纸；`index.html` 会把 `/spine-viewer/` 的尾斜杠规范化掉，避免相对资源路径错位。

## 控件浮层（WallKit）

壁纸页可以叠加 [WallKit](https://github.com/mikoberry/wallkit) 的控件：时钟、音频频谱、专辑卡、氛围粒子、
指针特效。分工是**WallKit 只做展示**（纯 props、不感知背景），本项目提供背景层并把宿主数据喂给它。

### 依赖与构建

`wallkit` 通过 **GitHub git 引用**分发（不发布 npm），并且是**源码直出、没有构建步骤**：

```json
"wallkit": "github:mikoberry/wallkit#b395855633615af7d1d058b36ba072c8692f1069"
```

因此 `vite.config.js` 里加了 `optimizeDeps.exclude: ['wallkit']`，让 Vite / `@vitejs/plugin-react`
自己编译它的 JSX，而不是让 esbuild 预打包去处理它的 CSS import。升级只改这一行的 commit sha。
组件 CSS 由组件自身 import（`wallkit/styles` 提供 `--wallkit-*` 主题变量），不并入 `global.css`。

### 五个控件

| 控件 | 配置键 | 需要的数据 | 默认 |
| --- | --- | --- | --- |
| 时钟 | `overlay.clock` | 无（自己每秒 tick 一次） | **开**，`minimal` 布局、左下角 |
| 音频频谱 | `overlay.spectrum` | WE 音频帧 | 关（开启后贴底满宽） |
| 专辑卡 | `overlay.albumArt` | WE 媒体信息 | 关 |
| 氛围粒子 | `overlay.ambient` | 无（飘雪 / 樱花 / 气泡） | 关 |
| 指针特效 | `overlay.pointer` | 指针事件（自己监听 window） | 关 |

全部由 `wallpaper.config.json` 的 `overlay` 段控制，逐项 `enabled`；全关时 `WallpaperOverlay` 直接返回 `null`，
页面恢复成纯壁纸。改完刷新即生效，不需要重新构建。也可以直接在壁纸页的**设置抽屉**里调（每个控件一个 tab，
实时预览，改的是同一批字段），调好点「记录配置」把整份文件贴回去即可持久化（内容同时会写进
`localStorage['wallpaper.config.record']`，可在 DevTools 的 Application → Local Storage 里取回）：

```json
"overlay": {
  "accent": "#a8c4ff",
  "clock": { "enabled": true, "placement": "minimal", "theme": "light", "anchor": "bottom-left", "offsetX": 4, "offsetY": 4 },
  "spectrum": { "enabled": true, "variant": "bars", "width": "100vw", "height": "14vh", "anchor": "bottom-center" },
  "albumArt": { "enabled": true, "variant": "classic", "anchor": "top-left", "offsetX": 4, "offsetY": 4 },
  "ambient": { "enabled": true, "variant": "sakura", "density": 100 },
  "pointer": { "enabled": true, "trailVariant": "glow", "clickVariant": "ripple" }
}
```

几条容易踩的约定：

- **`theme` 指文字色**：`'light'` = 浅色文字，配**深色**壁纸；`'dark'` = 深色文字，配浅色壁纸。与本项目背景一致时用 `light`。
- **`anchor` + `offsetX` / `offsetY`**：9 个锚点（四角 + 四边中点 + 居中），偏移从锚点**向内**计；数字是视口百分比，
  字符串是任意 CSS 长度（`'100px'`）。`0` 恒等于贴边，从左下换到右下不用翻符号。
- **`size` / `width` / `height`**：控件尺寸。频谱与专辑卡还接受 `width` / `height` 精确覆盖盒子
  （上例是「贴底满宽、厚度固定」）。`variant` 见上游 README（时钟 10 种、频谱 9 种、专辑卡 6 种）。
- **`accent`** 只作用于频谱 / 粒子 / 指针特效；时钟与专辑卡的主色来自各自 `theme`（专辑卡封面主色还取自曲目本身）。

### Wallpaper Engine 数据桥接

`vite.config.js` 里的 `wallkitWE()` 会把音频 / 媒体 / 暂停三段监听器以 **classic script** 注入 `index.html`
的 `<head>` 最前面（必须早于模块入口，否则会丢首帧）。普通浏览器里这些全局函数不存在，脚本自动跳过——
所以浏览器里**时钟照常走，频谱是平的、专辑卡不渲染**，这是库的规定行为，不会用假数据兜底。

要在 WE 里真的出数据，需要一份 `project.json`——**`npm run build:we` 会自动生成**（见「部署到 Wallpaper Engine」）。
形状与生成的值一致：

```json
{
  "file": "index.html",
  "general": { "supportsaudioprocessing": true },
  "title": "BrownDust 2",
  "type": "Web"
}
```

- `supportsaudioprocessing` **必须嵌在 `general` 内**，写顶层会被静默忽略（症状：监听器注册成功但回调 0 次）。
- `type` 必须是大写 `"Web"`。
- 暂停由 `useWallpaperPaused()` 分发：时钟停止 tick、频谱 / 粒子 / 指针特效冻结（`Clock` 自己没有 `paused` prop）。

### 与构图的边界

- 浮层在 `.wallpaper-overlay` 里（`position: absolute; inset: 0; z-index: 5`），**在 `.wallpaper-design` 之外**，
  锚定的是**视口**：改 `fit` 或缩放设计画布都不会移动 / 放大控件。
- 层级：背景与模型 < 浮层（5）< 构图手柄（6）< 设置抽屉（7）。`AmbientFx` 在浮层内部压在最下面
  （ambient 1 → 频谱 3 → 指针 4 → 时钟 / 专辑 5），雪从时钟背后穿过。
- 浮层不参与构图计算，也不改变「画面永不响应指针」这条规则：`PointerFx` 只是装饰覆盖层，默认关闭。
- WE 桌面壁纸默认不投递鼠标事件：想让指针特效应在实机看到，要在 WE 里为该壁纸开启鼠标交互。
  背景里若已经叠了 WE 自带粒子层，就不要再开 `ambient`，两层不同步的雪比没有更难看。

## 添加模型

目录是**递归扫描**的，层级不限；当前按 `角色 / 皮肤` 两级组织：

```
model-library/
  Wilhelmina/
    Iron_Monarch/
      cutscene_char067601.skel     # 或 .json
      cutscene_char067601.atlas
      cutscene_char067601.png      # atlas 里声明的每一页都要在
      cutscene_char067601_2.png
  Olivier/
    Faithful_Wings/
      cutscene_char003601.skel
      ...
  skill_cutscene_background/       # 可选：共享背景图库
      char067601_back1.png
      char003601_back2.png
      ...
```

- **背景自动关联**：背景库的文件名里含 6 位角色 ID（如 `067601`），扫描器用它和模型 stem 里的 ID 对应，
  自动挂到该模型的背景下拉里。皮肤目录里自己放的图片也会作为背景候选。
- **背景分类**：`backN` 干净编号 = 完整场景；`-N` / `_N` 分片层、`*move` 低清版、特效层归到「不推荐」。
  命名混用 `char067601_back1` / `003401 back2` / `000303_back1` / `back 1` 都能识别。
- `model-library/` 是唯一素材源、只读，不需要复制进 `public/`：
  - **dev**：Vite 插件按 `/models/<磁盘相对路径>` 直接读源文件；
  - **build**：只输出 manifest 引用到的文件（图集页 + 关联背景），366MB 的共享背景库**不会**整包进 `dist/`；
  - 新增/删除文件会自动刷新清单；`npm run model:list` 可检查图集页是否齐全。
- **共享背景库不进 git**：`.gitignore` 排除 `model-library/skill_cutscene_background/`（1036 张 / 366MB），
  本地保留供扫描器读取。新环境 clone 后需自行放置该目录，否则壁纸没有背景图；确实要入库用 `git add -f`。

## 调试查看器功能（/spine-viewer）

以下功能只存在于调试页，壁纸页一概不加载、不显示：

- 左侧模型库、右侧「动画 / 信息」面板；动画列表带时长，可直接切换
- 播放 / 暂停、循环、倍速、进度条拖拽定位；`_faceN` 表情叠加轨道、皮肤切换
- 滚轮以光标为中心缩放、拖拽平移、适应画布 / 重置视图、双击适应
- 骨骼线、包围盒调试显示；背景可切棋盘格 / 浅灰 / 深灰 / 素材自带背景图
- 状态栏显示 FPS、缩放比例、当前动画；支持空格、F、R、`+`、`-` 快捷键

## 实现要点

- runtime 锁在 **4.1.x**：本游戏 skel 由 Spine 4.1.11 导出，3.8 的 runtime 解析不了。
- `drawSkeleton(skeleton, false)`：BD2 图集**没有**预乘 alpha，第二位传 `true` 会让大面积半透明叠加被白板盖住。
- 角色立绘只播 `idle` 会得到白脸，五官由 `_faceN` 附件动画在轨道 1 提供；查看器会自动挑一条。
- 多页图集是 `_2.png` … `_N.png` 独立文件，atlas 页名必须与磁盘文件名一致。
- 背景候选里带 `-N` / `_N` 后缀的是局部遮罩、`*move` 是低清版，界面会归到「不推荐」。
- 当前 7 套 cutscene 模型全部是 Spine 4.1.11，动画命名有 `cut_A`/`cut_B` 与 `A_cut`/`B_cut` 两种混用；
  每套都有 `loop_2`，查看器默认选它（与 `loop` 是两条互斥姿势线，不要混着播）。
- 两个页面共用同一个 `SpineStage`；`fitRatio` / `interactive` / `showLoading` / `design` 是壁纸页专用的
  可选 props，默认值保持调试页行为不变，不会出现两套 WebGL / 资源加载逻辑。`design` 模式下取景改用
  `useSpineAsset` 冻结的 `setupBounds`（调试页仍用动画姿态包围盒）。
- 扫描器会读 PNG 的 IHDR，把背景图原生 `width`/`height` 写进 manifest；壁纸基准在构建期就确定，
  不依赖浏览器里 `Image.onload` 的异步时机。
- 两层变换都由 `resolveLayerTransform()` 解析成设计坐标元组后分两路应用：背景走 CSS transform，
  模型走 `design.transform` 进相机；canvas 自身不加 CSS transform，否则 `k = 位图宽 / 设计宽` 会失效。
- WallKit 浮层与构图**完全解耦**：它渲染在 `.wallpaper-design` 之外的独立层里，用视口锚点定位，
  不读 `design` / `fit` / `scale`。数据 hooks 分散在各控件组件内，只开时钟时不会订阅音频帧。

## 目录

按 **feature-based** 组织：`app/` 应用层、`features/` 两个独立的产品能力、`lib/` 共享技术层。
划分依据是「谁会用到这段代码」，不是文件类型；只有被多个 feature 复用的代码才提升到 `lib/`。

```
index.html                       # 挂载点；规范化 /spine-viewer/ 尾斜杠
vite.config.js                   # modelLibraryPlugin() + react() + wallkitWE()，base: './'
scripts/
  scan-model-library.mjs         # 纯 Node 扫描器，产出 manifest（含 PNG IHDR）
  model-library-plugin.mjs       # 虚拟模块 + dev 中间件 + build 产物输出
  deploy-weproject.mjs           # 把 dist/ 复制成 WE 工程（生成 project.json）
src/
  main.jsx                       # Vite 入口
  app/
    App.jsx                      # 路由分发：/ → 壁纸，/spine-viewer → 调试页
    router.js                    # 零依赖两路由判断 + pushState 导航
  features/
    wallpaper/                   # 根路由正式壁纸（默认零 UI）
      WallpaperPage.jsx          # 全屏壁纸（背景 img + canvas）+ 设置抽屉状态
      config.js                  # 壁纸唯一配置 + 构图纯函数
      color.js                   # hex ↔ HSV 换算（取色面板的数学）
      useParallax.js             # 鼠标视差驱动：归一化指针 + 缓动，写 CSS 变量与模型偏移 ref
      components/
        WallpaperSettings.jsx    # 壁纸设置抽屉：主题色 + 构图 / 5 个控件 tab
        SettingsBoundary.jsx     # 抽屉错误边界（面板出错不牵连壁纸）
        OverlaySettings.jsx      # 每个控件 tab 的字段面板（尺寸 / 位置 / 颜色 / 专有属性）
        settings-fields.jsx      # 抽屉共用表单控件（滑块 + 步进 / CSS 长度步进 / 颜色 / 选项按钮组 / 锚点 3×3）
        WallpaperOverlay.jsx     # WallKit 控件浮层（视口锚定，按 overlay 配置逐项显示）
    viewer/                      # /spine-viewer 调试查看器
      ViewerPage.jsx             # 状态 + 布局
      components/                # 侧栏、工具栏、检查器、时间轴
  lib/
    spine/                       # 共享 Spine 引擎：useSpineAsset / SpineStage（WebGL 与相机）
    animation.js                 # 默认动画 / 表情挑选（两个 feature 共用）
    assets.js                    # BASE_URL 相关的资源 URL + 格式化
    uiScale.js                   # 按视口算 --ui-scale（1080p = 1），chrome 长度的唯一来源
  styles/global.css
model-library/                   # 唯一素材源，只读
```

> `AGENTS.md` 是给 coding agent 的约束清单（feature-based 架构规则、Spine 技术坑、构图数学、
> 执行规则、Git 约定），已与当前实现同步；使用方式与配置说明以本 README 为准。
> 早期自研 WE 外壳 / 部署脚本的设计文档已删除；控件浮层现在统一走 WallKit（上游文档见
> `node_modules/wallkit/README.md`）。
