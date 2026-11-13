# AGENTS.md

给在本仓库工作的 coding agent 的说明。**动手改代码前先读完本文件**。
章节组织参考 bulletproof-react 的 AGENTS.md（概览 → 命令 → 结构 → 规范 → 组件 → 状态 → 数据层 → 错误处理 → 验证 → 工作流），
**只保留本项目适用的部分**。本文件只写会直接导致改错东西的约束；完整使用说明、配置表与目录结构见
[README.md](README.md)，两者冲突时以 README 与源码为准。

## 1. 项目概览（Project Overview）

《棕色尘埃2》（BrownDust 2）的 **Spine 模型查看器 + 全屏壁纸**。直接读取仓库里的 `model-library/`
（skel / atlas / 图集页 PNG / 背景图），**没有后端、HTTP API、数据库、登录或远程服务**。
壁纸页可以叠加 [WallKit](https://github.com/mikoberry/wallkit) 的控件浮层（时钟 / 频谱 / 专辑卡 / 氛围粒子 /
指针特效），并可通过 `wallkitWE()` 拿到 Wallpaper Engine 的音频与媒体数据；这两者都是**可选**的，
不装 WE 时页面仍是普通网页。

| 项 | 本项目实际值 |
| --- | --- |
| 语言 | JavaScript + JSX（**无 TypeScript，不要引入 `tsconfig`**） |
| UI | React 18.3 |
| 构建 | Vite 5 + `@vitejs/plugin-react`，`base: './'` |
| 渲染 | `@esotericsoftware/spine-webgl@4.1.56`（**必须在 4.1 线**） |
| 控件浮层 | `wallkit`（GitHub git 引用，**源码直出、无构建步骤**，不要改成 npm 版本或本地 copy） |
| 包管理器 | **npm**（锁文件 `package-lock.json`）。不要用 yarn / pnpm / bun |
| 样式 | 单一 `src/styles/global.css`，原生 CSS，无 UI 组件库（wallkit 自带组件 CSS 由其自身 import） |
| 路由 / 状态 | 零依赖自研两路由；只用 React 内置 state / ref，无路由库、无状态库 |
| 测试 | 无测试框架；验证靠 esbuild + 纯 Node，见 §13 |

`dist/` 可用 `file://` 或任意子路径打开（保留壁纸宿主场景的兼容性）。两个路由，用途严格分开：

| 路径 | 用途 |
| --- | --- |
| `/`（以及其它所有路径） | **正式页面 / 全屏壁纸**：固定模型 + 对应背景，无侧栏 / 无交互（滚轮、拖拽、双击都不响应）；默认值在 `public/wallpaper.config.json`（运行期）与 `src/features/wallpaper/config.js`（内置兜底）。chrome 只有右下角半透明构图手柄（`S` 键同效）与 `overlay` 配置开启的 WallKit 控件 |
| `/spine-viewer` | **开发调试辅助页**：完整查看器 UI（侧栏 / 工具栏 / 检查器 / 时间轴 / 状态栏）。**不挂任何壁纸浮层** |

旧 WE 方案留下的 `src/stage/`、`src/backdrop/`、`src/overlay/`、`src/we/`、`public/models/`、`project.json`、
`docs/` 以及部署 / 预处理脚本**都已删除**，不要按旧文档去找或重建。

## 2. 环境与命令（Setup Commands）

```bash
npm install            # 安装依赖（Node 18+）
npm run dev            # Vite dev server —— 由用户自己启动，agent 不要起
npm run model:list     # 纯 Node 扫描 model-library/，输出模型 / 图集页 / 关联背景
npm run build          # 生产构建到 dist/ —— 只在用户明确要求时执行
npm run build:we       # 构建 + 部署到本机 WE 工程目录（会写仓库外的文件，按需执行）
npm run deploy:we      # 只复制现有 dist/，不重新构建
npm run preview        # 预览构建产物
```

没有 `test` / `lint` / `format` / `generate` 脚本，也不要为本项目引入无关的脚手架或代码生成器。
`prepare:model` 已不存在：素材不复制进 `public/`，由插件在 dev/build 两路直接供给。

## 3. 项目结构（Project Structure）

采用 **feature-based** 组织：`app/` 是应用层，`features/` 放两个互相独立的产品能力，
`lib/` 放被多个 feature 共用的技术层。划分依据是「**谁会用到这段代码**」，不是「文件是什么类型」。

```
index.html                       # 挂载点；内联脚本规范化 /spine-viewer/ 尾斜杠
vite.config.js                   # react() + modelLibraryPlugin() + wallkitWE()，base: './'
public/
  wallpaper.config.json          # 运行期配置，原样复制到 dist/ 根；改完刷新即生效
scripts/
  scan-model-library.mjs         # 纯 Node 扫描器，产出 manifest（含 PNG IHDR 尺寸）
  model-library-plugin.mjs       # virtual:model-library + dev 中间件 + build emitFile
  deploy-weproject.mjs           # 把 dist/ 复制成 WE 工程文件夹并生成 project.json
src/
  main.jsx                       # Vite 入口（index.html 引用 /src/main.jsx，位置不要动）
  app/                           # 应用层：路由分发 + 路由实现
    App.jsx                      # 只做路由分发，不承载业务逻辑
    router.js                    # useRoute：两路由判断 + pushState 导航
  features/
    wallpaper/                   # Feature：根路由正式壁纸，默认无 chrome
      WallpaperPage.jsx          # 背景 img + canvas，页面入口 / 组合根；设置抽屉开关与 tweak 状态
      config.js                  # 内置默认值 + mergeConfig/loadWallpaperConfig + 构图纯函数
      components/
        WallpaperSettings.jsx    # 壁纸设置抽屉：主题色 + 「构图 / 时钟 / 频谱 / 专辑卡 / 氛围 / 指针」tab
        SettingsBoundary.jsx     # 抽屉的错误边界（面板崩了只隐藏面板，壁纸继续跑）
        OverlaySettings.jsx      # 每个控件 tab 的字段面板（启用 / 尺寸 / 位置 / 颜色 / 专有属性）
        settings-fields.jsx      # 抽屉共用表单控件（滑块 / 数字 / 文本 / 颜色 / 开关 / 选项按钮组 / 3×3 锚点）
        WallpaperOverlay.jsx     # WallKit 控件浮层（视口锚定），按 overlay 配置逐项显示
    viewer/                      # Feature：/spine-viewer 开发调试辅助页
      ViewerPage.jsx             # 状态 + 布局
      components/                # 只被 viewer 使用的 UI
        ModelSidebar.jsx
        Toolbar.jsx
        Inspector.jsx
        Timeline.jsx
  lib/                           # 共享技术层（不依赖任何 feature）
    spine/                       # 共享 Spine WebGL 引擎
      SpineStage.jsx             # 渲染循环 / 相机 / 指针交互
      useSpineAsset.js           # 资源加载 + 运行时对象构建
    animation.js                 # 默认动画 / 表情挑选（两个 feature 共用）
    assets.js                    # BASE_URL 资源 URL + 格式化
  styles/
    global.css                   # 全局样式
model-library/                   # 唯一素材源，只读
```

**Feature 内部结构**：每个 feature 自包含，扩展时按需只添加用得到的子目录：

```
src/features/<feature>/
├── <Name>Page.jsx   # 页面入口 / 组合根
├── components/      # 仅该 feature 使用的 UI
├── config.js        # 仅该 feature 使用的配置
├── hooks/           # 仅该 feature 使用的 hooks
└── utils/           # 仅该 feature 使用的纯函数
```

**架构规则（Architecture Rules）**

- **单向依赖**：`lib/` → `features/` → `app/`。`lib/` 不得 import 任何 feature；`app/` 只负责分发与挂载。
- **禁止跨 feature import**：`wallpaper/` 与 `viewer/` 互不 import。壁纸配置 `WALLPAPER` 只有 wallpaper feature 读，viewer 不得引用。
- **就近放置（Colocation）**：只被一个 feature 用到的代码留在该 feature 内；被 ≥2 个 feature 复用才提升到 `lib/`。
  目前 4 个 UI 组件全部是 viewer 专属，所以**没有** `src/components/` 共享目录；真出现共享 UI 时再建。
- **共享层不带产品语义**：`lib/spine/` 不知道壁纸 / 查看器的存在，只通过 props 被驱动。
- 新 feature 自己建目录、自带页面与配置，**不要**往 `app/` 里堆业务逻辑。

## 4. 代码规范（Code Standards）

- **无 TypeScript**：纯 JS / JSX，不引入 `tsconfig`、不写类型声明。
- **注释用英文，文档和界面文案用中文。**
- **文件命名（沿用现状，不要改）**：组件 `PascalCase.jsx`（如 `SpineStage.jsx`）；普通模块 `camelCase.js`
  （如 `animation.js`）；目录小写单词（`features/wallpaper/`、`lib/spine/`）。
  **不要**全量改成 kebab-case，也**不要**引入 `@/` 路径别名 —— 本项目一律用相对路径。
- **样式**：集中在 `src/styles/global.css`，class 用页面前缀（`.stage-*` / `.wallpaper-*` / `.model-item-*` 等），
  不用 CSS-in-JS、不用 Tailwind、不用组件库。
- **纯函数与副作用隔离**：构图 / 变换计算放在 `features/wallpaper/config.js` 等无 DOM 依赖的模块里，
  保证能直接在 Node 里 import 复算；WebGL 与 rAF 只出现在 `lib/spine/`。
- 组件文件顶部写一段英文注释说明职责；改了行为就同步改注释。

## 5. 组件约定（Component Guidelines）

- `app/App.jsx` **只做路由分发**，不放状态、布局或 WebGL 逻辑。
- 两个页面**共用同一个** `SpineStage`；`fitRatio` / `interactive` / `showLoading` / `design` 是壁纸页专用的
  可选 props，**默认值必须保持调试页行为**，不要写第二套 WebGL / 资源加载逻辑。
- 组件靠 props + 回调通信，不因为「参数有点多」就引入全局 store；确实要共享时按 §3 提升到 `lib/`。
- **壁纸页的 chrome 只能是「按需呼出」**：`WallpaperSettings` 默认收起（`visibility: hidden`，不占 Tab 焦点），
  由右下角手柄或 `S` 键打开、`Esc` / × 关闭。抽屉用 tab 分组：`构图`（背景 / 模型两层）+ 五个控件各一个 tab，
  顶部是共用主题色（`overlay.accent`）。它的编辑只改页面内存状态，**绝不写回 `config.js`，也不持久化**；
  唯一出口是「复制配置」：输出**完整配置文件内容**（`_readme` + 全部字段，两层 transform 与 `overlay` 都用面板当前值），
  未调整时与 `public/wallpaper.config.json` **逐字节相同**（键顺序沿用 `WALLPAPER`，`JSON.stringify(..., 2)` + 换行）。
  改字段或顺序时要保持这个等价性；面板控件只能**原值透传**，不要在 UI 层做单位换算或格式化后写回
  （唯一例外是两层 transform 的 `round2` / `Math.round`，它们对未调整的值是恒等变换）。
  不要给它加常驻按钮、toast 或自动保存。
- **控件面板不许出现第二份默认值**：`OverlaySettings` 只读 `overlay` 里的当前值，缺字段时用 `?? 常量` 只用于
  渲染（如 `beatIntensity ?? 100`），写回时不要顺手补键，否则「复制配置」就不再与文件等价。
  枚举列表（频谱 / 专辑 / 氛围 / 指针的 variant）优先从 wallkit 的导出取；只有 Clock 的 10 个 `placement`
  需要在本仓库硬编码（库未导出）。
- **壁纸页禁止任何依赖 OS 弹窗的控件**：WE 的 CEF 宿主里 `<select>` 的下拉、`input type="color"` 的系统配色框、
  `alert` / `confirm` / `prompt`、`<dialog>` / `window.open` 都会让壁纸窗口崩掉（不是渲染错，是进程没了）。
  枚举一律用 `ChipField`（一排 `.ws-chip` 按钮，`title` 里带库的原始值），颜色用 `ColorField`
  （色块 `<span>` 预览 + 十六进制输入 + `COLOR_PRESETS` 预设按钮）。加新字段时别退回原生 select / color input。
  `src/features/viewer/` 是浏览器里的调试页，不受此限制。
- `SettingsBoundary` 包在抽屉外面：面板渲染抛错只隐藏面板并 `console.error`，壁纸继续运行，
  关闭抽屉后再开会重试。**不要**为了「方便调试」把它去掉——WE 里一次未捕获异常就是黑屏。
- **画面本身永不响应指针**：壁纸页没有拖拽 / 滚轮 / 双击，构图只能通过抽屉里的滑块或数字框改。
  不要重新引入「在画面上拖动图层」这类交互，它和「背景原生像素 = 设计画布」的构图模型冲突，容易只拖得动背景。
  WallKit 的 `PointerFx` 是**纯装饰覆盖层**（不改构图、默认关闭），不属于这条限制。
- **WallKit 控件浮层（`WallpaperOverlay.jsx`）的边界**：
  1. 只放在 `.wallpaper-overlay` 里（`position: absolute; inset: 0; z-index: 5`，
     在 `.wallpaper-page` 下、`.wallpaper-design` 外）——它们锚定**视口**，绝不进设计画布，
     否则 `fit` 缩放会把控件一起放大 / 移动。层级必须在构图手柄（6）与抽屉（7）之下。
  2. **全部由 `overlay` 配置驱动**，每个控件 `enabled` 独立；全关时组件返回 `null`，页面恢复成纯壁纸。
     页面里真正传给 `WallpaperOverlay` 的是**抽屉可编辑的那份** `overlayTweaks`（初始值 = `config.overlay`），
     不要绕过它直接读 `config.overlay`，否则面板调不出效果。
     不要为控件加常驻 UI、不要在这里读写 localStorage。
  3. 数据只从 `wallkit/we` 的 hooks 来（`useWallpaperAudio` / `useWallpaperBeat` / `useWallpaperMedia` /
     `useWallpaperPaused`）。**禁止造假数据兜底**：没有 WE 宿主时频谱平、专辑卡不渲染，这是库的规定行为。
     `useWallpaperAudio()` 返回**原地改写的固定引用**，不要把它塞进 state 或 clone，否则画面会冻在第一帧。
  4. 数据订阅必须跟着控件走（`SpectrumWidget` / `AlbumWidget` / `BeatClock` 各自调用对应 hook），
     否则只开时钟的壁纸也会付音频 rAF 的成本。
  5. `Clock` 没有 `paused` prop：暂停 = 停止更新 `now`（见 `useNow`）。
- 时间由 `SpineStage` 的 rAF 循环回调（`onProgress` / `onStats`）驱动，**组件不自行起定时器轮询**。
- **选中状态与 `onLoaded` 的三条耦合不要破坏**：
  1. `SpineStage` 只在 asset 变化时上报模型信息 → `selectModel` 对同 id 必须幂等（否则清空面板后无人补报）；
  2. 面板靠 `infoReady` 自愈；
  3. `onLoaded` 带 `modelId`，上层据此丢弃切换模型时的迟到上报。

## 6. 状态管理（State Management）

- **只有 React 内置 state**：`useState` 管 UI 状态，`useRef` 管 rAF 循环中要读的可变值
  （pan / zoom / bounds / drag）。没有全局 store、没有登录、没有表单提交，不要为此引入状态库。
  唯一的「请求」是壁纸页 mount 时读一次 `wallpaper.config.json`，用 `useState` + `useEffect` 存即可，
  不要引入 react-query / SWR 之类的数据层。
- 壁纸页的 `useState(configTweaks)` + `useEffect(() => setTweaks(configTweaks), [configTweaks])` 是**故意**的：
  配置是异步到的，默认值必须以它为准；别把它改成 `useState` 懒初始化，否则文件里的值永远不生效。
- `overlayTweaks` 用**同一套模式**（`useState(config.overlay)` + 同步 effect）。重置按 target 分流：
  `'all'` → 两层 + 整个 overlay；`'backdrop'` / `'model'` → 单层；其余 target 视为控件 key（`clock` / `spectrum` /
  `albumArt` / `ambient` / `pointer`）。重置必须用 `{ ...base[target] }` 复制，**保留键顺序**（复制等价性依赖它）。
- `SpineStage` 把所有 props 镜像进 `liveRef.current`，让渲染循环按 asset 创建一次、不随每次 UI 重渲染重建。
  改这里时保持「循环闭包读 ref，不读旧 props」。
- **不要开 `StrictMode`**：dev 下双挂载会在同一个 canvas 上创建 / 销毁 / 重建 WebGL 上下文，
  Spine 着色器会处于半释放状态。

## 7. 素材流水线 / 数据层（Asset Pipeline）

本项目唯一的「数据层」是构建期扫描出的素材清单（虚拟模块 `virtual:model-library`），以及一个运行期读取的
`public/wallpaper.config.json`；没有 HTTP API / 后端。

- 目录为 `model-library/<角色>/<皮肤>/` 两级，扫描器递归任意深度；当前 7 套（Olivier 4 / Wilhelmina 3），全部 Spine 4.1.11。
- 共享背景库 `model-library/skill_cutscene_background/` 约 1036 张 / 366MB，按文件名与模型 stem 里的 **6 位角色 ID** 关联。
  命名混用 `char067601_back1` / `003401 back2` / `000303_back1` / `back 1`，必须用正则匹配，不能按空格或下划线切分。
  `backN` 才是完整场景；`-N` / `_N` 分片、`*move` 低清版、`_L` / `_R` 局部层都不可用。
- 每个 manifest 文件都带 `source`（相对 `model-library/` 的磁盘路径）与多段 `url`。dev 由插件中间件按 `/models/*` 直读源目录；
  build 只 `emitFile` manifest 引用的文件，不会把 366MB 背景库整包打进 `dist/`。URL 段单独 encode，
  `emitFile` 的 `fileName` 必须 `decodeURIComponent`（背景文件名含空格）。
- `model-library/` 只读；源素材不做重编码，`.atlas` 里的页名与磁盘文件名天然一致。
- `.gitignore` 排除 `/model-library/skill_cutscene_background/`：本地保留供扫描器读取，确实需要入库时 `git add -f`。
  **新环境 clone 后没有背景库**，壁纸背景会缺失，需要用户自行放置。

### 运行期配置文件（`public/wallpaper.config.json`）

唯一的运行期「配置数据」，也是壁纸页默认值的正式入口。

- Vite 把 `public/` 原样复制到 `dist/` 根，所以文件名**不带 hash**、可以打包后手改；`import` 里**没有**它，
  它是 `fetch` 出来的静态资源（`configFileUrl()` 用 `document.baseURI` 解析，dev / dist / 子路径都成立）。
- 加载流程：`loadWallpaperConfig()` → `mergeConfig(WALLPAPER, json)` 深度合并 → 失败则原样用内置 `WALLPAPER`，
  `console.warn` 一条并返回 `source: 'builtin'`。**绝不 reject**，壁纸必须有画面。
- 合并规则：只对纯对象递归，数字 / 字符串 / 布尔 / 数组 / `null` 整体替换；`_` 前缀键当注释丢弃；未知键保留
  （方便先加字段再实现）。
- 优先级：内置 `WALLPAPER` → JSON → 抽屉里的临时调整；`?model=` 只覆盖模型选择。
- 壁纸页在配置 settle 之前**不挂载 `SpineStage`**（否则会按内置 modelId 加载一次、再按文件里的重载一次）。
- 新增设置的正确做法：先在 `WALLPAPER` 里给默认值 → JSON 里加同名键 → 在 `WallpaperPage` 里读 `config.xxx`。
  不要在组件里写 `?? 某个魔法数`，默认值只允许出现在 `WALLPAPER`。
- `overlay` 段是 WallKit 控件浮层的唯一开关（`accent` + `clock` / `spectrum` / `albumArt` / `ambient` /
  `pointer` 五组，各自 `enabled`）。改它只影响浮层，不影响构图；`theme` 按 WallKit 约定指**文字色**
  （`light` = 浅色文字，配深色壁纸）。加新控件时同步三处：`WALLPAPER.overlay`、
  `public/wallpaper.config.json`、`WallpaperOverlay.jsx`，并保持「复制配置」与文件的字节等价。

## 8. Spine 运行时约束（Runtime Constraints，实测，不要凭直觉改）

1. **runtime 必须 4.1.x**：游戏 skel 由 Spine 4.1.11 导出，3.8 的 runtime 解析失败，不要引入旧版单文件 runtime。
2. **`drawSkeleton(skeleton, false)`**：BD2 atlas 没有 `pma` 标记（非预乘 alpha）。传 `true` 时立绘看起来正常，
   但 cutscene / interaction 这类大面积半透明叠加会被一块白板盖住。
3. **多页图集是 `xxx_2.png` … `_N.png` 独立文件**，不是打成一张大图；页名必须与磁盘文件名一致。
4. **角色立绘需在轨道 1 叠 `_faceN`**，只播 `idle` 会得到一张白脸（五官由独立的 `AttachmentTimeline` 提供）。
5. **`loop` 与 `loop_2` 不是长短版本**，是两套互斥姿势线各自的循环。默认选 `loop_2`；动画名 `cut_A`/`cut_B`
   与 `A_cut`/`B_cut` 两种混用，7 套模型都有 `loop_2`。

## 9. 壁纸构图（Wallpaper Composition，改相机前必读）

对应实现：`features/wallpaper/config.js`（配置 + 纯函数）与 `lib/spine/SpineStage.jsx` 的 `design` 分支。

- `skel.width/height` 只是 setup pose 包围盒，**不是**设计分辨率。基准 = **对应背景图的原生像素尺寸**
  （扫描器读 PNG IHDR 写入 manifest 的 `width`/`height`，构建期就确定）。
- 背景 `<img>` 与 WebGL `<canvas>` 同为 `.wallpaper-design` 子元素，**共用唯一一个 CSS transform**；
  屏幕尺寸 / 比例变化只改这一个 `scale`（`contain` / `cover`），容器内部相对几何恒定。
- `SpineStage` 的 `design` 模式用**加载时冻结的 `setupBounds`**（实时姿态包围盒会让动画播放时构图漂移），
  以 `k = canvas.width / (design.width * overscan)` 为唯一「设计→设备像素」因子反解相机；调试页不传 `design`，行为不变。
  因为 canvas 布局宽度同样乘了 `overscan`，`k` 恒等于 `renderScale`，构图数学与「画布正好一层」时逐位相同。
- **不要在 `.wallpaper-design` 上加 `overflow: hidden`**：两层都被允许平移 / 放大到画布之外（`WALLPAPER.overscan`，
  默认 1.5 倍的渲染面 `.wallpaper-surface`），裁剪由视口负责。裁在画布边界上会让宽屏留边区「拖不过去」——
  背景图正好等于画布大小，一旦平移就被切掉，只剩模糊的 `bleed` 补边，看起来像一个方块在滑动。
- canvas 位图分辨率按 transform 后的实际显示尺寸渲染；**canvas 自身不能加 CSS transform**，否则 `displayScale` / `k` 失效。
- 背景与模型可分别缩放 / 平移（`backdropTransform` / `modelTransform`），但**只允许设计坐标单位**：
  倍率、设计像素、`'10%'`（相对设计画布宽 / 高）。屏幕 px / `vw` / `vh` / 视口百分比会破坏确定性。
  `resolveLayerTransform()` 是唯一解析点；背景用 CSS `translate(dx,dy) scale(s)`（origin 50%），
  模型用 `design.transform` 在相机里 `worldZoom / s` + `target += (dx,dy)*k`。**平移不被该层缩放放大**。
- 改相机数学时必须保持「模型 / 画布归一化矩形与 scale、dpr、屏幕比例无关」。用纯 Node 复算验证：
  `compositionRects()` / `normalizeRect()` 是这套计算的唯一来源，7 视口 × DPR 1/2 × contain/cover 下偏差应为浮点误差量级。
- 构图设置抽屉（`features/wallpaper/components/WallpaperSettings.jsx`）里的数值一律是**设计像素**，
  进入渲染前同样走 `resolveLayerTransform()`，所以「面板调到 X」与「`wallpaper.config.json` 写 X」等价。
- 改默认构图时**优先改 `public/wallpaper.config.json`**（打包后仍可改、无需重建），`config.js` 里的 `WALLPAPER`
  只作为兜底默认值同步更新；两者字段必须一一对应。

## 10. 路由（Routing）

- 路由零依赖（`src/app/router.js`，不引入 react-router）：判断路径**最后一段**为 `spine-viewer`，或 `#spine-viewer` / `?viewer`，
  其余一律落到壁纸 —— 这让 `file://` 与子路径托管都能工作。`file://` 下返回壁纸时要补 `index.html` 文件名。
- **`index.html` 里的尾斜杠规范化脚本不能删**：`base: './'` 下 `/spine-viewer/` 会让 `./assets/*` 解析到错目录。
- 只有两个页面，不引入路由表 / 懒加载路由；新增 feature 时在 `app/App.jsx` 加分发分支即可。

## 11. 错误处理（Error Handling）

- **壁纸页**：默认无 UI，只有加载失败或素材库为空时左下角显示一行纯文本，同时 `console.error`。
  不要加 toast / 弹窗 / 重试按钮（构图设置抽屉是唯一的例外，且必须保持收起状态）。
- **配置文件读取失败必须静默降级**：`loadWallpaperConfig()` 不 reject，返回内置默认值 + `source: 'builtin'`，
  `console.warn` 一条即可。`file://` 下 fetch 本地 JSON 必然失败，这是预期路径，不要当错误弹提示。
- **调试页**：`onError` → 右下角 `error-toast`，可手动关闭；资源加载带 60s 超时与图集页缺失提示。
- WebGL 上下文创建失败由 `SpineStage` 捕获并走 `onError`；`AssetManager.dispose()` 放在 effect cleanup，
  切模型前释放图集纹理。
- 没有远程错误上报，不要引入监控 SDK 或全局错误拦截器。

## 12. 性能与构建产物（Performance & Build Output）

- canvas 位图分辨率按 CSS transform 之后的**实际显示尺寸**渲染，`renderScale = min(dpr * displayScale, 3 / overscan)`；
  canvas 自身不能加 CSS transform，否则 `displayScale` / `k` 失效。除以 `overscan` 是为了让放大后的渲染面
  **最大位图尺寸（显存占用）与画布正好一层时相同**，不要去掉这个除法。
- 每份 asset 只创建**一个** rAF 循环；姿态包围盒只在 `fitPendingRef` 时重算，不逐帧调 `getBoundsRect()`。
- 调试包围盒 overlay 在隐藏时避免每帧写 DOM（防强制重排）。
- build 只 emit manifest 引用的素材，`dist/` 不含 366MB 背景库；`base: './'` 保证 `file://` 与任意子路径可用。
  不要改成绝对路径或加 CDN 部署假设。
- **`wallkit` 是源码直出的 git 依赖**（无构建步骤），所以 `vite.config.js` 里 `optimizeDeps.exclude: ['wallkit']`，
  由 Vite / `@vitejs/plugin-react` 自己编译它的 JSX。去掉这行会让 dev 预打包去处理它的 CSS import。
  升版本只改 `package.json` 的 commit sha（`github:mikoberry/wallkit#<sha>`），不要改成 npm 包或 vendor 副本。
- `wallkitWE()` 只是往 `index.html` 的 `<head>` 顶部注入 classic script（audio / media / pause，`timeline` 默认关）。
  它不改构图、不写 `project.json`；`dist/index.html` 里应能看到 `<!-- wallkit-we:* -->` 标记。

### WE 部署（`npm run build:we`）

- `scripts/deploy-weproject.mjs` 默认目标
  `F:\SteamLibrary\steamapps\common\wallpaper_engine\projects\myprojects\BD2-test`，可用 `WE_PROJECT` 覆盖；
  它会写仓库外的文件，**只在用户明确要求时执行**。
- 只清 `assets/` / `models/` / `index.html` 三项，其它文件（`preview.gif`、WE 自己生成的快照等）必须保留。
- `wallpaper.config.json` **已存在就不覆盖**（部署目录里的就地调参优先），同步用 `WE_FORCE_CONFIG=1`；
  不要为了「一致性」改成每次覆盖。
- `project.json` 由脚本生成：`file: index.html`、`type: "Web"`（大写）、
  `general.supportsaudioprocessing: true`（**必须在 `general` 内**）。`preview` 只在目标目录里真有图片时才登记。
- 目标路径防护：段数 < 3 或等于仓库根时直接拒绝，避免误删。改这段时别放宽。

## 13. 验证方式（Verification）

按成本从低到高，不要越级；**agent 不做渲染验证**：

1. **语法与 import**：
   ```
   node_modules/.bin/esbuild src/main.jsx --bundle --external:react --external:react-dom --external:@esotericsoftware/spine-webgl --external:virtual:model-library --external:wallkit --external:wallkit/* --loader:.css=css --format=esm --outfile=/tmp/check.js
   ```
   退出码 0 = 语法与所有 import 路径解析成功（`wallkit` 本身由 Vite 编译，这里按外部依赖跳过）。
2. **纯 Node**：`npm run model:list`；构图数学校验直接 import `src/features/wallpaper/config.js` 的
   `compositionRects()` / `normalizeRect()`；配置合并用 `mergeConfig()` 断言（空 override 等于默认值、
   嵌套部分覆盖、`_` 键被丢弃、`public/wallpaper.config.json` 的键与 `WALLPAPER` 一致）。
   该文件顶层**不能**依赖 `import.meta.env` / `document`（否则 Node 无法 import），只在函数体内用 `document`。
   抽屉的「复制配置」也要断言：未调整面板时，生成内容与 `public/wallpaper.config.json` **逐字节相同**。
3. **构建**：`npm run build`（仅用户明确要求时），核对 `dist/` 只含 manifest 引用的素材，
   且 `dist/wallpaper.config.json` 存在、文件名无 hash。
4. 实际画面由用户自己在浏览器 / 壁纸宿主里确认。

**不要**跑无头浏览器、截图、Playwright 或任何浏览器自动化；不要在报告里把「构建通过」说成「验证通过」。

## 14. 开发流程与 Git（Development Workflow & Git）

- **不要自行启动 dev server / 不要留后台进程、服务或开放式前台命令。**
- 临时产物用完必须清理；某步卡住就终止、看输出、换更小的检查。
- 远程 `git@github-miko:mikoberry/browndust2-model-viewer.git`；本仓库 local 配置必须是
  `user.name=mikoberry` / `user.email=mikoberry@users.noreply.github.com`（**全局默认是另一个账号，别用**）。
- 提交信息用英文 conventional commits（`feat:` / `fix:` / `docs:` / `chore:`）。
- 用户默认只要**本地 commit，不主动 push**；提交大素材前先确认范围。

## 15. 常见改动路径（Common Patterns）

- **加模型**：把 `.skel` / `.json` + `.atlas` + 全部图集页 PNG 放进 `model-library/<角色>/<皮肤>/`，刷新即可；
  用 `npm run model:list` 核对图集页是否齐全。不要改 `src/` 去硬编码模型列表。
- **改壁纸**：调默认构图改 `public/wallpaper.config.json`（运行期、打包后可改）；`src/features/wallpaper/config.js`
  的 `WALLPAPER` 只是兜底默认值，改了要同步 JSON。这些都不参与调试页。
- **改调试 UI**：只动 `src/features/viewer/`；若某组件要复用到壁纸，先按 §3 提升到共享层。
- **加 / 调控件浮层**：只动 `WallpaperOverlay.jsx` + `overlay` 配置两处；组件 API 与 WE 接线细节查
  `node_modules/wallkit/README.md` 与 `node_modules/wallkit/docs/we-integration.md`（上游仓库
  https://github.com/mikoberry/wallkit），不要凭记忆猜 prop。
- **改相机 / 构图数学**：同时对照 `lib/spine/SpineStage.jsx` 的 `design` 分支与
  `features/wallpaper/config.js` 的 `compositionRects()`，并用 §13 的纯 Node 复算确认归一化矩形不变。
- **加 feature**：在 `src/features/` 下自建目录（页面 + 专属 `components/` / `config.js`），
  在 `app/App.jsx` 增加分发分支；共享逻辑下沉到 `lib/`。

## 16. 参考文档

- [README.md](README.md) — 唯一对外文档：运行、路由、壁纸配置表、两层变换单位规则、目录结构。
- 早期 WE / wallkit 方案的设计文档（`docs/asset-research.md`、`docs/design-cutscene-wilhelmina.md`）**已删除**，不要再引用。
