# AGENTS.md

给在本仓库工作的 coding agent 的说明。**动手改代码前先读完本文件**。
章节组织参考 bulletproof-react 的 AGENTS.md（概览 → 命令 → 结构 → 规范 → 组件 → 状态 → 数据层 → 错误处理 → 验证 → 工作流），
**只保留本项目适用的部分**。本文件只写会直接导致改错东西的约束；完整使用说明、配置表与目录结构见
[README.md](README.md)（英文，默认）与 [README.zh-CN.md](README.zh-CN.md)（中文），两者冲突时以 README 与源码为准。

## 1. 项目概览（Project Overview）

《棕色尘埃2》（BrownDust 2）的 **Spine 模型查看器 + 全屏壁纸**。直接读取仓库里的 `model-library/`
（skel / atlas / 图集页 PNG / 背景图），**没有后端、HTTP API、数据库、登录或远程服务**。
壁纸页可以叠加 [WallKit](https://github.com/mikoberry/wallkit) 的控件浮层（时钟 / 频谱 / 专辑卡 / 氛围粒子 /
指针特效 / 聚光灯 / 取景框），并可通过 `wallkitWE()` 拿到 Wallpaper Engine 的音频与媒体数据；这两者都是**可选**的，
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
| `/`（以及其它所有路径） | **正式页面 / 全屏壁纸**：固定模型 + 对应背景，无侧栏 / 无交互（滚轮、拖拽、双击都不响应）；配置三层 = `src/features/wallpaper/config.js`（内置兜底）→ `public/wallpaper.config.json`（**出厂默认**）→ 用户「记录配置」的 `localStorage` 快照（**最优先**）。chrome 只有右下角半透明构图手柄（`S` 键同效）、`overlay` 配置开启的 WallKit 控件，以及 `overlay.burst` 配置时多出的礼炮按钮 |
| `/spine-viewer` | **开发调试辅助页**：完整查看器 UI（侧栏 / 工具栏 / 检查器 / 时间轴 / 状态栏）。**不挂任何壁纸浮层** |

旧 WE 方案留下的 `src/stage/`、`src/backdrop/`、`src/overlay/`、`src/we/`、`public/models/`、`project.json`、
`docs/` 以及部署 / 预处理脚本**都已删除**，不要按旧文档去找或重建。

## 2. 环境与命令（Setup Commands）

```bash
npm install            # 安装依赖（Node 18+）
npm run dev            # Vite dev server —— 由用户自己启动，agent 不要起
npm run model:list     # 纯 Node 扫描 model-library/，输出模型 / 图集页 / 关联背景
npm run build          # 生产构建到 dist/（ESM，给浏览器 / 调试）—— 只在用户明确要求时执行
npm run build:home     # 同上，但只打包 home 配置的那一个模型
npm run build:home:embed # 只构建不部署的自包含产物（等价于 build:home -- --embed）
npm run build:we       # 普通构建（真实素材文件）+ 部署到本机 WE 工程目录（默认；会写仓库外的文件，按需执行）
npm run build:we:embed # 自包含构建（素材 base64）+ 部署 —— 仅 WE 2.8.797 beta / file:// 需要
npm run deploy:we      # 只复制现有 dist/，不重新构建（产物形态原样带过去）
npm run we:new         # 新建一个 WE 工程目录：embed 构建 + 部署到 <myprojects>/<角色>_<皮肤>，标题走 --title
npm run project:gen    # 从 publish/project.config.js 重新生成 WE 工程目录里的 project.json，不用重新构建
npm run project:check  # 只报告 project.json 与配置的漂移，不写盘
npm run project:latest # 找 myprojects 下「最近改动（mtime）」的文件夹，按同一套规则生成/合并它的 project.json
npm run verify:embed   # 纯 Node 自检 embed 产物（无 module/crossorigin、素材完整）
npm run preview        # 预览构建产物
```

产物形态（embed / 真实文件）与「是否部署」是**两件正交的事**：形态只由 `BD2_EMBED=1`（或
`build-home.mjs --embed`）决定，`dist/` 只会有一份，后跑的命令覆盖前一个。不要新增第三套构建链路。

没有 `test` / `lint` / `format` / `generate` 脚本，也不要为本项目引入无关的脚手架或代码生成器。
`prepare:model` 已不存在：素材不复制进 `public/`，由插件在 dev/build 两路直接供给。

## 3. 项目结构（Project Structure）

采用 **feature-based** 组织：`app/` 是应用层，`features/` 放两个互相独立的产品能力，
`lib/` 放被多个 feature 共用的技术层。划分依据是「**谁会用到这段代码**」，不是「文件是什么类型」。

```
index.html                       # 挂载点；内联脚本规范化 /spine-viewer/ 尾斜杠
vite.config.js                   # react() + modelLibraryPlugin() + wallkitWE()，base: './'
public/
  wallpaper.config.json          # 出厂默认配置，原样复制到 dist/ 根；用户「记录」过则以记录为准（`overlay.burst` 除外，见下）
publish/                         # 只用于「发布 Wallpaper Engine 工程」的元数据：src/ 不 import、不进 dist
  project.config.js              # WE 工程清单声明：Workshop 标题 / 简介 / 属性面板自定义文案（html() 区块）
  preview.gif                    # 默认缩略图：deploy 只在目标目录没有任何预览图时播种过去
  wallpaper.presets.json         # 人物配置库：每个人物一份完整配置，换人物靠手动整块复制（代码不读）
  wallpaper.burst.config.js      # 礼炮按钮（overlay.burst）配置模板，整块复制进 wallpaper.config.json
  wallpaper.titles.local.json    # 按完整 modelId 索引的 Workshop 标题（本地、gitignore）
  wallpaper.titles.skill-cutscene.json  # 按 <角色>/<皮肤> 索引的标题表（本地、gitignore）
scripts/
  scan-model-library.mjs         # 纯 Node 扫描器，产出 manifest（含 PNG/WebP/JPEG 头解析尺寸）
  model-library-plugin.mjs       # virtual:model-library + dev 中间件 + build emitFile
  embed-build-plugin.mjs         # BD2_EMBED=1：素材 → base64 内嵌，index.html 换成 classic script（见 §12）
  verify-embed.mjs               # 纯 Node 自检 embed 产物，不需要浏览器
  project-manifest.mjs           # project.json 唯一生成点：读 project.config.js → defineProject + mergeProject
  gen-project.mjs                # npm run project:gen / project:check：单独重生成或校验 project.json
  adopt-latest.mjs               # npm run project:latest：取 myprojects 里最近改动的目录，套用同一套 project.json 生成规则
  deploy-weproject.mjs           # 把 dist/ 复制成 WE 工程文件夹，并合并写出 project.json
src/
  main.jsx                       # Vite 入口（index.html 引用 /src/main.jsx，位置不要动）
  app/                           # 应用层：路由分发 + 路由实现
    App.jsx                      # 只做路由分发，不承载业务逻辑
    router.js                    # useRoute：两路由判断 + pushState 导航
  features/
    wallpaper/                   # Feature：根路由正式壁纸，默认无 chrome
      WallpaperPage.jsx          # 背景 img + canvas，页面入口 / 组合根；设置抽屉开关与 tweak 状态
      config.js                  # 内置默认值（静态 import 出厂 JSON 合并而成）+ mergeConfig/loadWallpaperConfig（几何函数从 lib/composition.js 转出）
      color.js                   # hex ↔ HSV 换算（取色面板用，无 React/DOM，可在 Node 里测）
      useParallax.js             # 鼠标视差：归一化指针 + 缓动，写 CSS 变量（背景）与 offsetRef（模型）
      useCompositionBlend.js     # 段间 / 入场 → 固定构图的渐变：写 --backdrop-* 与 transformRef，不进 state
      useResampledBars.js        # 频谱柱数：把实时 128 帧按 resampleBars 折成 N 根（wallkit 要求调用方折叠）
      components/
        WallpaperSettings.jsx    # 壁纸设置抽屉：主题色 + 「构图 / 时钟 / 频谱 / 专辑卡 / 氛围 / 指针」tab
        SettingsBoundary.jsx     # 抽屉的错误边界（面板崩了只隐藏面板，壁纸继续跑）
        OverlaySettings.jsx      # 每个控件 tab 的字段面板（启用 / 尺寸 / 位置 / 颜色 / 专有属性）
        settings-fields.jsx      # 共用表单控件（滑块 + 步进 / CSS 长度步进 / 颜色 / 开关 / 按钮组 / 3×3 锚点）
        WallpaperOverlay.jsx     # WallKit 控件浮层（视口锚定），按 overlay 配置逐项显示
    viewer/                      # Feature：/spine-viewer 开发调试辅助页
      ViewerPage.jsx             # 状态 + 布局（含构图预览状态与配置文件读取）
      components/                # 只被 viewer 使用的 UI
        ModelSidebar.jsx
        Toolbar.jsx
        Inspector.jsx             # 三个 tab：动画 / 构图 / 信息
        CompositionPanel.jsx      # 构图调参 + 「复制完整配置」
        CompositionStage.jsx      # 固定设计画布预览（背景 img + SpineStage 共用一层 transform）
        Timeline.jsx
  lib/                           # 共享技术层（不依赖任何 feature）
    spine/                       # 共享 Spine WebGL 引擎
      SpineStage.jsx             # 渲染循环 / 相机 / 指针交互 / 入场队列
      useSpineAsset.js           # 资源加载 + 运行时对象构建
      clipLayers.js              # 把"分层/变体"动画折进主动画（纯函数，可纯 Node 复算）
    composition.js               # 设计画布几何（唯一来源，无 DOM，可纯 Node 复算）
    variants.js                  # 显示变体：白名单 / 归一化 / 覆盖合并（纯函数，两个 feature 共用）
    backdrops.js                 # 背景挑选（'auto' 规则，两个 feature 共用）
    animation.js                 # 默认动画 / 表情挑选 + 入场序列识别（两个 feature 共用）
    assets.js                    # BASE_URL 资源 URL + 格式化
    uiScale.js                   # 视口 → --ui-scale（1080p = 1），壁纸 chrome 长度都乘它
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
- **`publish/` 只被 `scripts/` 读**：清单声明、缩略图、标题表、人物配置库、礼炮模板都放这里。
  `src/` 一行都不能 import 它，`vite` 也不会把它打进 `dist/`；要新增「发布期才用到的文件」就丢进这个目录，
  **不要**放仓库根（根目录只留工程级配置：`package.json` / `vite.config.js` / `index.html` / 目录），
  也**不要**放 `public/`（那是运行时资源，会被复制到站点根、浏览器可直接访问）。

## 4. 代码规范（Code Standards）

- **无 TypeScript**：纯 JS / JSX，不引入 `tsconfig`、不写类型声明。
- **注释用英文，文档和界面文案用中文。**
- **文件命名（沿用现状，不要改）**：组件 `PascalCase.jsx`（如 `SpineStage.jsx`）；普通模块 `camelCase.js`
  （如 `animation.js`）；目录小写单词（`features/wallpaper/`、`lib/spine/`）。
  **不要**全量改成 kebab-case，也**不要**引入 `@/` 路径别名 —— 本项目一律用相对路径。
- **样式**：集中在 `src/styles/global.css`，class 用页面前缀（`.stage-*` / `.wallpaper-*` / `.model-item-*` 等），
  不用 CSS-in-JS、不用 Tailwind、不用组件库。
- **纯函数与副作用隔离**：构图 / 变换计算放在 `lib/composition.js` 等无 DOM 依赖的模块里，
  保证能直接在 Node 里 import 复算；WebGL 与 rAF 只出现在 `lib/spine/`。
  注意：不要让它间接 import `lib/assets.js`（模块顶层读 `import.meta.env.BASE_URL`，Node 里会炸），
  所以背景挑选单独放在 `lib/backdrops.js`。
- 组件文件顶部写一段英文注释说明职责；改了行为就同步改注释。

## 5. 组件约定（Component Guidelines）

- `app/App.jsx` **只做路由分发**，不放状态、布局或 WebGL 逻辑。
- 两个页面**共用同一个** `SpineStage`；`fitRatio` / `interactive` / `showLoading` / `design` 是壁纸页专用的
  可选 props，**默认值必须保持调试页行为**，不要写第二套 WebGL / 资源加载逻辑。
- 组件靠 props + 回调通信，不因为「参数有点多」就引入全局 store；确实要共享时按 §3 提升到 `lib/`。
- **壁纸页的 chrome 只能是「按需呼出」**：`WallpaperSettings` 默认收起（`visibility: hidden`，不占 Tab 焦点），
  由右下角手柄或 `S` 键打开、`Esc` / × 关闭。抽屉用 tab 分组：`构图`（背景 / 模型两层 + 鼠标视差 + 入场动画重播）
  + 六个控件各一个 tab（时钟 / 频谱 / 专辑卡 / 氛围 / 光照 / 指针；聚光灯在「指针」tab 内，是 `overlay.spotlight`
  独立配置段；取景框 `overlay.frame` 在「其他」tab 里，和性能读数 / 清除存储同处），
  顶部是共用主题色（`overlay.accent`）。它的编辑只改页面内存状态，**绝不写回 `config.js`**；
  唯一出口是「记录配置」：生成**完整配置内容**（`_readme` + 全部字段，两层 transform、入场开关与 `overlay` 都用面板当前值），
  写进 `localStorage['mikoberry:wallpaper.config.user:<modelId>']`（`{ at: ISO, config: <完整配置对象> }`）**并**复制到剪贴板（clipboard API 失败时回退
  `execCommand`，两者都失败也要把状态如实显示成「记录失败 / 复制失败」）。
  **键必须带 owner + 模型命名空间**（`storageKey()`，见 §7 存储段）：WE 里所有网页壁纸共用一个 `file://` origin 的
  localStorage，裸键会让几张壁纸互相顶掉配置。
  未调整时这份内容与 `public/wallpaper.config.json` **逐字节相同**（键顺序沿用 `WALLPAPER`，`JSON.stringify(..., 2)` + 换行）。
  **优先级：内置 `WALLPAPER` < `wallpaper.config.json` < 用户记录**（`loadWallpaperConfig()` 先读文件、再
  `mergeConfig(file, recorded.config)`，`source` 变成 `'user'` 并带 `recordedAt`）。
  也就是：**文件只是出厂 / 首次默认值**，用户记录过就以记录为准，刷新、切到别的壁纸再切回来都一样；
  只有「恢复首次默认」（`clearRecordedConfig()` + `location.reload()`）或宿主清掉该壁纸的存储（卸载重装）才回到文件。
  记录是**完整文档**，所以它会连同当时等于内置值的字段一起覆盖文件——这是刻意的（「按我记录的来」），不要改成
  「只记录与默认不同的键」；只有记录里根本没有的键（新版本才加的）才回落到文件 / 内置值。
  旧键 `wallpaper.config.record`（`{ at, text }`，当年只写不读）**故意不再读**：它的内容已经过时。
  storage 在 WE 的 `file://` 宿主里可能被拒（`setItem` 抛错），必须 try/catch 且不因此中断复制。
  改字段或顺序时要保持这个等价性；面板控件只能**原值透传**，不要在 UI 层做单位换算或格式化后写回
  （唯一例外是两层 transform 的 `round2` / `Math.round`，它们对未调整的值是恒等变换）。
  不要给它加常驻按钮、toast 或自动保存；「恢复首次默认」用**两步点击**（按钮文字变「确认恢复？」），
  因为在 WE 的 CEF 里 `confirm()` 会把壁纸窗口带崩。
- **调试页的「构图」tab 是壁纸构图的调参台**（`viewer/components/CompositionPanel.jsx` +
  `CompositionStage.jsx`）：它用同一个 `lib/composition.js` 按壁纸的方式渲染设计画布，
  读写的就是 `wallpaper.config.json` 的键（启动时 fetch 该文件作起点），「复制完整配置」按文件的键顺序生成整份内容。
  这里允许原生 `<select>` / `<input type="range">` / 数字框（只在浏览器里跑，没有 CEF 弹窗与无键盘问题）；
  **不要把这类控件搬进壁纸抽屉**。切换预览开关时 `CompositionStage` 保持同一棵子元素树，避免重挂 `SpineStage`
  导致模型重新加载。预览的播放源有两条：点某一镜（`compose.solo`）= 只把 `[这一段]` 交给 `SpineStage`，
  单段序列天然循环，方便单独抠构图；「播放完整入场」才传完整 `sequence` 并把面板切回跟随当前镜头。
  **不要**让「选段」顺带播整串——那会让人分不清屏幕上是哪一段。
  **预览区比例**（工具栏右侧「视口」：`auto` / `16:9` = 1920×1080）改的是 `.stage-area` 里那层
  `.stage-frame` 的**盒子**：`auto` 铺满（`left/top 0` + `100%`），锁定比例时用 JS 量 `.stage-area`
  （`ResizeObserver`）算一个居中的 16:9 框。`SpineStage` 与 `CompositionStage` 都是量自己的 CSS 盒
  （canvas 的 `clientWidth/Height`、`.compose-viewport`），所以只换外框就能得到真实的 1080p 取景——
  **不要**去改相机或加第二套渲染路径。`.stage-frame` 必须**常驻渲染**（只改 inline 盒），否则切比例
  会把 `SpineStage` 卸掉重挂、重新载入素材。
- **控件面板不许出现第二份默认值**：`OverlaySettings` 只读 `overlay` 里的当前值，缺字段时用 `?? 常量` 只用于
  渲染（如 `beatIntensity ?? 100`），写回时不要顺手补键，否则「记录配置」的内容就不再与文件等价。
  枚举列表（频谱 / 专辑 / 氛围 / 指针的 variant）优先从 wallkit 的导出取；只有 Clock 的 10 个 `placement`
  需要在本仓库硬编码（库未导出）。
- **壁纸页禁止任何依赖 OS 弹窗的控件**：WE 的 CEF 宿主里 `<select>` 的下拉、`input type="color"` 的系统配色框、
  `alert` / `confirm` / `prompt`、`<dialog>` / `window.open` 都会让壁纸窗口崩掉（不是渲染错，是进程没了）。
  枚举一律用 `ChipField`（一排 `.ws-chip` 按钮，`title` 里带库的原始值），颜色用 `ColorField`
  （色块按钮 + 十六进制读数，点开是页面内自绘的 HSV 面板：`color.js` 的换算 + CSS 渐变 + pointer capture，
  没有 canvas、没有系统对话框）。加新字段时别退回原生 select / color input。
  `src/features/viewer/` 是浏览器里的调试页，不受此限制。
- **抽屉里不许有 `input[type=text|number]`**：WE 不给壁纸窗口键盘焦点，能看见却敲不进去的框等于坏控件。
  数值 = 读数 + `-` / `+` 按钮（`SliderField` 的按钮走该字段的 `step`，`LengthField` 保留配置里的单位、
  「自动」清空）。新增可调数值时用这两个，不要为了「能直接输入」把文本框加回来。
- `SettingsBoundary` 包在抽屉外面：面板渲染抛错只隐藏面板并 `console.error`，壁纸继续运行，
  关闭抽屉后再开会重试。**不要**为了「方便调试」把它去掉——WE 里一次未捕获异常就是黑屏。
- **壁纸 chrome 的长度必须分辨率无关**：抽屉 / 手柄 / 失败提示里的每一个字号、内边距、控件高度、圆角、
  抽屉宽度都写成 `calc(<n>px * var(--ui-scale))`，`--ui-scale` 由 `src/lib/uiScale.js` 在 `main.jsx` 启动时
  按 `min(视口宽/1920, 视口高/1080)`（夹在 `0.85–2.4`）写到 `<html>` 的内联自定义属性上，
  1080p = 1、2K = 1.33、4K = 2。**不要**在这里写裸 `px`：那正是「2K 屏上字只有一半大」的来源。
  例外：`1px` 描边保持裸值（保持一像素细），壁纸构图用的**设计像素**（`backdropTransform` / `modelTransform`、
  `.wallpaper-design` 里的尺寸）绝对不要乘 `--ui-scale`，那是画面坐标系。改 `resolveUiScale` 时保持
  `min(宽比, 高比)` 而不是面积比：3440×1440 这类带鱼屏应与 2560×1440 同尺寸，而不是被宽度撑大。
- **抽屉必须一屏放得下**：WE 里没有滚轮事件，`.ws-body` 的滚动条等于不可用，所以控件 tab 的字段按
  两列排（`.ws-pair`；位置行用 `.ws-pair.is-position`：3×3 锚点在左跨两行，右侧竖排水平 / 垂直两个偏移滑块）。
  加字段时先找能并排的伙伴，
  别把 `.ws-body` 的滚动当功能用；抽屉宽度 `440px`（再乘 `--ui-scale`），改宽度要回头看每个 tab 是否仍不滚。
- **画面本身永不响应指针**：壁纸页没有拖拽 / 滚轮 / 双击，构图只能通过抽屉里的滑块 / 步进按钮改。
  不要重新引入「在画面上拖动图层」这类交互，它和「背景原生像素 = 设计画布」的构图模型冲突，容易只拖得动背景。
  WallKit 的 `PointerFx` 是**纯装饰覆盖层**（不改构图、默认关闭），不属于这条限制。
  **鼠标视差是唯一被允许的「画面跟随指针」**：它只读指针位置、产生一个可回零的设计像素偏移
  （见 §9），不改变构图基准、不写配置、不涉及拖拽 / 缩放，因此不违反这条。
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

- 目录为 `model-library/<角色>/<皮肤>/` 两级，扫描器递归任意深度；当前 15 套（Olivier 4 / Wilhelmina 3 / Liatris 4 / Ren_Yamashiro 2 / Tenka_Izumo 2），全部 Spine 4.1.11。
- 背景图库 `model-library/backdrops/<6 位角色 ID>/`，按文件名与模型 stem 里的 **6 位角色 ID** 关联；
  目录结构纯粹为人服务——扫描器递归全库、只认文件名，所以分桶、改名、加层级都不影响关联。
  命名混用 `char067601_back1` / `003401 back2` / `000303_back1` / `back 1`，必须用正则匹配，不能按空格或下划线切分。
  `backN` 才是完整场景；`-N` / `_N` 分片、`*move` 低清版、`_L` / `_R` 局部层都不可用。
- 每个 manifest 文件都带 `source`（相对 `model-library/` 的磁盘路径）与多段 `url`。dev 由插件中间件按 `/models/*` 直读源目录；
  build 只 `emitFile` manifest 引用的文件，不会把整库背景打进 `dist/`。URL 段单独 encode，
  `emitFile` 的 `fileName` 必须 `decodeURIComponent`（背景文件名含空格）。
- `model-library/` 只读；源素材不做重编码，`.atlas` 里的页名与磁盘文件名天然一致。
- **背景只留「本地有模型」的桶**：无用桶既不入库也不留盘，做哪个角色就把哪个拉回来。
  `scripts/backdrops.mjs` 一个脚本管三件事——`ids` 打印应有 ID、`add <id>` 从上游复制该桶并补 `.gitignore` 白名单、
  `prune` 删无模型的桶并收缩白名单。上游默认 `F:/live2d/.../assets/ui/skill_cutscene_background`，可用 `BD2_BACKDROP_SRC` 覆盖。
  因此 clone 后背景只覆盖当前已入库的 15 个角色，换壁纸到别的角色要先 `backdrops:add`。

### 运行期配置文件（`public/wallpaper.config.json`）

壁纸页的**出厂默认值**（首次打开 / 恢复默认 / 宿主清空存储时生效）。

- Vite 把 `public/` 原样复制到 `dist/` 根，所以文件名**不带 hash**、可以打包后手改；`import` 里**没有**它，
  它是 `fetch` 出来的静态资源（`configFileUrl()` 用 `document.baseURI` 解析，dev / dist / 子路径都成立）。
- 加载流程：`loadWallpaperConfig()` → `readConfigFile()`（`mergeConfig(WALLPAPER, json)`，失败则原样用内置
  `WALLPAPER`、`console.warn` 一条、`source: 'builtin'`）→ 再叠用户记录（`readRecordedConfig()`，
  有则 `mergeConfig(file, recorded.config)`、`source: 'user'` + `recordedAt`）。**绝不 reject**，壁纸必须有画面。
- 合并规则：只对纯对象递归，数字 / 字符串 / 布尔 / 数组 / `null` 整体替换；`_` 前缀键当注释丢弃；未知键保留
  （方便先加字段再实现）。
- 优先级：内置 `WALLPAPER` → JSON（出厂默认）→ **用户记录**（`localStorage['mikoberry:wallpaper.config.user:<modelId>']`）→ 抽屉里的临时调整；
  `?model=` 只覆盖模型选择。**用户的记录会盖掉文件里同名字段**，所以给所有人换默认值时改文件只对
  「没记录过 / 点了恢复默认 / 卸载重装」的人生效。
- **存储键 = `<owner>:<键名>:<modelId>`**（`config.js` 的 `STORAGE_OWNER` / `storageNamespace()` / `storageKey()`）：
  WE 的所有网页壁纸跑在同一个 `file://` origin 上（实测在
  `we/ui/wpcache/monitor<N>/base/Default/Local Storage/leveldb`，键前缀只有一个 `_file://`），
  裸键会被所有壁纸共享 —— 曾经「记录配置」一张就把另外几张的构图 / 背景 / 浮层全顶掉。
  owner 是纯人眼标记（`mikoberry`，可换成任意固定串，例如随机 id `98ks023n99`），运行时没有任何解析，
  换它只会让已发布版本的快照变成孤儿，不会让运行中的壁纸出错。
  模型段取**工厂配置的 `modelId`**（shipped JSON / embed 内联配置），不能取快照里的 `modelId`
  （读键要用的键，循环），也不能受 `?model=` 影响。
  `mikoberry:wallpaper.followPrompt.dismissed:<modelId>` 同理；`wallpaper.locale`、`bd2.stats` 是全局偏好，故意不加前后缀。
  旧键（裸 `wallpaper.config.user`、以及只有模型段的 `wallpaper.config.user:<modelId>`）只在
  `config.modelId` 与本包一致时被一次性**复制**过来（旧键保留，同模型共用的第二份预设可能还要读）。
  抽屉的「清除存储」只能清本壁纸的键（`clearWallpaperStorage()`），**不要**再写 `localStorage.clear()`
  —— 那会连带清掉别的壁纸的快照。
- 壁纸页在配置 settle 之前**不挂载 `SpineStage`**（否则会按内置 modelId 加载一次、再按文件里的重载一次）。
- 新增设置的正确做法：先在 `WALLPAPER` 里给默认值 → JSON 里加同名键 → 在 `WallpaperPage` 里读 `config.xxx`。
  不要在组件里写 `?? 某个魔法数`，默认值只允许出现在 `WALLPAPER`。
- `overlay` 段是 WallKit 控件浮层的唯一开关（`accent` + `clock` / `spectrum` / `albumArt` / `ambient` /
  `light` / `pointer` / `spotlight` / `frame`，各自 `enabled`）。改它只影响浮层，不影响构图；`theme` 按 WallKit 约定指**文字色**
  （`light` = 浅色文字，配深色壁纸；`frame` 的 `theme` 同义，指取景线的明暗）。加新控件时同步三处：`WALLPAPER.overlay`、
  `public/wallpaper.config.json`、`WallpaperOverlay.jsx`，并保持「记录配置」内容与文件的字节等价。
- **喷射按钮（`overlay.burst`）是唯一没有 `enabled` 的浮层设置**：没有这个键就**没有按钮**（不渲染），
  配了就有（`true` = 全默认）。它不进抽屉、也不写进「记录配置」的快照（`configPayload` 里剥掉），
  所以 `wallpaper.config.json` 始终是唯一来源。参数解析 / 弧度换算集中在 `src/features/wallpaper/burst.js`
  （`normalizeBurstConfig()` / `burstCommand()`，纯函数，注意 `angle` 是**度**且 `0` = 正上、**负 = 逆时针**：
  左上 45° 是 `-135`（不是 -45，那个是右上）、`x/y` 是视口比例）。
  **不要**给它加抽屉入口 —— 需求是「作者打包前按壁纸手调，观众看不到任何入口」。
- **`LightFx`（光照）是整幅画面的天气光**，不是控件：铺满定位上下文、`pointer-events: none`、自身 `z-index: 2`
  （氛围粒子 1 之上、其余控件之下——画面被照亮而文字不被糊掉）。和聚光灯相反，它**第一帧就在**：没有指针输入的壁纸
  照样有天气，`follow` 只是加分项，所以别把「收不到指针事件」当成不显示的理由。
  `anchor` 放的是**光源中心**（一个点，不是盒子角），光束方向由它推出，**没有第二个 angle prop**，别加。
  `size: 0` 是本项目的「跟随变体预设」哨兵（每个变体有自己的光池半径），`WallpaperOverlay` 里换成 `undefined` 再传；
  别把 0 直接传下去——`radial-gradient` 的非正半径是**无效声明**，浏览器会丢掉整条 `background-image`，光会整层消失。
  `rays` / `flare` 不是亮度而是**分配**（多少光走成光束 / 光斑倍率），`overcast` 没有光束、只有 `beach` 有光斑，
  所以抽屉里按变体隐藏这两个滑块，别做成永远无效的控件。`intensity` 是唯一亮度旋钮（一次乘光池 / 热点 / 光束三层），
  壁纸要调暗就动它，不要改变体数值。
- **`Frame`（取景框）是画面级装饰，不是控件**：铺满定位上下文（`position: absolute; inset: 0`）、没有 `anchor`、
  不接受 children、不改任何布局；自身 `z-index: 7`，在聚光灯（6）之上——取景线不该跟着曝光压暗。
  它**不计时**（WallKit 硬约束：暂停的壁纸不能显示还在走的读数），所以 `timecode` 收的是已格式化字符串，
  时钟在应用层：`WallpaperOverlay` 的 `useFrameSeconds()` 每秒累加、`paused` 时停、再用 `formatTimecode()` 格式化。
  别把 `setInterval` 挪进组件，也别改成从时间戳现算（暂停恢复会跳）。`rec` 存三态字符串
  （`off` / `dot` / `rec` → `false` / `true` / `'REC'`），因为 JSON 布尔表达不了「只要红点不要字」。
  四角文字是 `overlay.frame.labels: true|false` 的**开关**，文案是常量 `FRAME_LABELS`（`WallpaperOverlay.jsx`，
  现在 `AUTO / 4K · 60P / F/2.8 / ISO 400`）——WE 窗口拿不到键盘焦点，抽屉里不放假输入框，所以只暴露开关；
  改文案就改那个常量。WallKit 用 CSS 把拉丁字母转大写；`rec` 占 tl、`timecode` 占 br 时角标自己下移一行。

## 8. Spine 运行时约束（Runtime Constraints，实测，不要凭直觉改）

1. **runtime 必须 4.1.x**：游戏 skel 由 Spine 4.1.11 导出，3.8 的 runtime 解析失败，不要引入旧版单文件 runtime。
2. **`drawSkeleton(skeleton, false)`**：BD2 atlas 没有 `pma` 标记（非预乘 alpha）。传 `true` 时立绘看起来正常，
   但 cutscene / interaction 这类大面积半透明叠加会被一块白板盖住。
3. **多页图集是 `xxx_2.png` … `_N.png` 独立文件**，不是打成一张大图；页名必须与磁盘文件名一致。
4. **角色立绘需在轨道 1 叠 `_faceN`**，只播 `idle` 会得到一张白脸（五官由独立的 `AttachmentTimeline` 提供）。
5. **`loop` 与 `loop_2` 不是长短版本**，是两套互斥姿势线各自的循环。默认选 `loop_2`；动画名 `cut_A`/`cut_B`
   与 `A_cut`/`B_cut` 两种混用，7 套模型都有 `loop_2`。

## 9. 壁纸构图（Wallpaper Composition，改相机前必读）

对应实现：`lib/composition.js`（几何纯函数）、`features/wallpaper/config.js`（配置 + 合并）与
`lib/spine/SpineStage.jsx` 的 `design` 分支。

- `skel.width/height` 只是 setup pose 包围盒，**不是**设计分辨率。基准 = **对应背景图的原生像素尺寸**
  （扫描器解析 PNG IHDR / WebP VP8X·VP8·VP8L / JPEG SOF 写入 manifest 的 `width`/`height`，构建期就确定；
  格式按 magic bytes 判断，不看扩展名，所以 `.webp` / `.jpg` 背景同样有正确尺寸）。
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
- **鼠标视差（`parallax: { enabled, backdrop, model }`）** 是叠加在构图之上的**设计坐标平移**，不是新的构图基准：
  指针归一化到视口 `-1..1`，乘**设计画布百分比**后得到设计像素偏移（`parallaxOffset()` 是唯一换算点，正负号 = 同向 / 反向）。
  背景走 CSS 自定义属性 `--parallax-x/y`（设在 `.wallpaper-design` 上，`.wallpaper-backdrop` 的 `transform` 里
  `translate(var(--parallax-x,0px), …)` 消费，与 React 拥有的 `--backdrop-x/y/scale` 分开，避免抢写 inline style）；
  模型走 `design.offsetRef.current`，由 `SpineStage` 每帧读 ref 加进相机 target（同样乘 `k`）。
  **两侧都不要走 React state**：60fps 的漂移会整页重渲染。缓动与 rAF 只存在于 `features/wallpaper/useParallax.js`，
  指针静止后循环自己停下。改这里时保证「指针居中 = 偏移 0」「同一归一化指针在不同设计尺寸下比例相同」。
- **入场序列（`sequence`）**：BD2 的 `cut_A → cut_B → loop_2` 是**同一个 track 0 的队列**，不要为它另建播放器。
  `sequence` 名字先过一遍 `asset.data.findAnimation()` 过滤（换 `modelId` 后不会抛错，只会少播几段），
  然后 `setAnimation(0, 第一段, loop=false)` + 对每段 `addAnimation(0, name, 最后一段 ? loop : false, 0)`；
  `setAnimation` 会顺带清掉 track 0 上残留的队列，所以「重新播放」只要让 effect 重跑即可。
  `sequenceActiveRef` 是 track 0 的**归属标记**：单动画 effect 与 `loop` effect 看到它必须直接 return，
  否则入场会被重置成循环动画、或被强制 `loop=true` 变成死循环。`sequenceToken` 是唯一的重播入口
  （抽屉「入场动画 → 重新播放」），**不要**用重载 asset / 重挂组件的方式重播。
  序列每段之间的过渡沿用 `AnimationStateData.defaultMix`（0.2s）；名字因模型而异，配置里改（`sequence: "auto"` 会走
  `lib/animation.js` 的 `pickEntranceSequence()` 按动画名识别），代码里不要针对某个皮肤硬编码。
- **分层 / 变体动画（`lib/spine/clipLayers.js`）**：BD2 有相当一部分 cutscene 把一镜拆成
  `<镜头>_<道具或特效>` 的兄弟动画——`cut_A_water` 只驱动水花那 6 根骨，`cut_A_bowl` 只画手和碗。**单独播主动画
  看起来就是缺东西**，所以加载后 `mergeClipLayers(data)` 会把这一类折进主动画，名字仍叫主动画，
  `sequence` / 点击 / 进度 / seek 全都不用改。判定必须保守（同长度、后缀非 `_数字`、叠加层骨骼数
  ≤ 主动画 60% 或骨骼集合完全相同）。同一主动画下有多个兄弟动画时，判断"叠加"还是"二选一"要**看骨骼重合**，
  不能看 timeline 里的 key 冲突：BD2 每条 clip 都写全 slot 的附件快照，key 撞车毫无意义。已折入的层动过同一批
  骨骼（重合 ≥ 60%）才说明它是这个特效的另一种演法（`cut_B_snake` / `cut_B_sword` / `cut_B_water`、四只可选宠物、
  三声音效），此时只折第一个、其余留在列表里可选；骨骼互不相交的就是独立部件（`cut_A_dragon` + `cut_A_tail` +
  `cut_A_waterdrop` 全折）。
  被折掉的子动画打上 `clipLayerOf` 标记，`readAssetInfo()` 不再列出它们（但 `findAnimation` 仍能找到，
  老配置里写全名不会炸）。
  **附件时间轴必须并集，不能覆盖**（踩过坑）：BD2 的 `AttachmentTimeline` 是"全量快照"，clip 不画的 slot 在 0 秒
  统一写 `null`。按"后写覆盖"折 `cut_A_bowl` 会把人物、脸、头发全部 null 掉，画面只剩一只手端碗——所以
  `foldAttachmentTimeline()` 里真实附件名才接管，`null` 不覆盖主动画已有的名字，两边都 `null` 才隐藏。
  反向同理：叠加层对某 slot **完全没写**说明它靠自己的 setup pose 渲染（`A_water`），这类主动画里的"全 null
  时间轴"要删掉，让 setup 接管——只要**有一个**被折入的层没写这个 slot 就删（Glacia 的 `loop` 就是：base 把
  龙特效置 null，`loop_dragon` 没写、靠 setup 显示，不删就少 32 个部件）；只有当所有折入层都明确写了 null
  才保留隐藏。但只统计被折入的层——被跳过的替代品（`A_cut_w2`）会把 `A_cut_w1` 那套道具置 null，
  让它参与就会把 w1 的衣服剥光。还有一层坑：同形状有多份 slot 副本共用 setup 附件
  （`A_arm_r4_bbb` / `A_arm_r4_fff` 都是 `A_arm_r4`），各 clip 只用一份，叠加层换了另一份时原那份必须保持隐藏，
  否则同一个部件画两遍（判定：setup 附件被本层另一个 slot 画出）。
  **不要**改成"多轨同时播放"：轨道 1 属于表情，而且 track 0 的 sequence/click 逻辑全都要跟着改。
  改这里必须用真 skel **跑播放**断言可见集合（只比 timeline 数量看不出来）：`cut_A` 折完可见 slot 应等于
  base ∪ layer 再减去被替代的副本；`Sweet_Temptation` 是 135 + 57 - 2 = 190，脸/脖子/马尾/碗同时在，围裙按
  base 的 setup 保留，`loop_2` 不被卷入，连跑两次 timeline 数不变。
- **入场构图（`entrance.clips`，按段）**：入场不是「一组构图」，而是**每段一组**——BD2 的 `cut_A` / `cut_B` /
  `loop_2` 是三个独立镜头，背景、缩放、位置都可能不同。`entrance.clips` 以**动画名**为键（不是数组下标：
  名字来自 skel，顺序来自 `sequence`），每项是 `{ backdrop, backdropTransform, modelTransform }`；
  `backdrop: ''` = 跟随全局 `backdrop`。没配置的段用 `NEUTRAL_LAYER`（`1×`、无偏移 = 原始画布）。
  `SpineStage` 在 rAF 里比对 `state.getCurrent(0).animation.name`，**每段只回调一次** `onSequenceStage`
  （不是每帧），壁纸据此换构图与背景图——60fps 里做这件事会整页重渲染。
  **设计画布永远跟全局 `backdrop` 走**，某段换图只换 `<img>` 的 `src`（启动时预加载所有段的图，避免闪白）；
  让画布跟着段变会让所有设计像素数字失去意义、画面整体跳一下。
  最后一段（`sequence` 末尾）成为当前动画时入场即结束（`onSequenceDone`）：`SpineStage` 把 track 0 交还给
  `animation`（同名就用现有 entry，**不要**再 `setAnimation`，那会把循环段从第 0 帧重启、明显跳一下；
  不同名则 `setAnimation(0, animation, loop)` 交叉淡入），`useCompositionBlend` 同时在 `entrance.blend` 秒内缓动回
  `backdropTransform` / `modelTransform`。**「入场（按段）」只在入场期间生效，结束后一律回「构图」**——
  别让最后一段的 clip 变成常驻构图（那会让抽屉里「构图」的滑块彻底失效，用户看到的就是「设置没用了」）。
  单段序列（调试页的「单段循环」预览）不算入场，不做交还、就一直循环那一镜。
  **是否自动播放由 `entrance.autoplay` 决定**：`true`（默认）= 加载完成后自动播一遍，并且在壁纸右下角
  齿轮**上方**多一个圆形播放按钮（`.wallpaper-play-toggle`，和抽屉「重新播放」共用 `replaySequence`）；
  `false` = 打开就直接是「构图」、不出现播放按钮（抽屉里仍能手动重播）。实现上多了一级
  `wantsEntrance = autoplay || sequenceToken > 0`，且**不播入场时给 `SpineStage` 传 `sequence={null}`**
  —— 空列表正是「只播 `animation`」的既有语义，不要为此新增开关。抽屉里的勾选框改的是内存 override
  （`autoplayOverride`，`null` = 跟随配置，避免配置晚到时被一份旧副本盖住），「全部重置」把它清回 `null`。
  **右下角竖列还有个「切换立绘」按钮**（`.wallpaper-variant-toggle`，在播放按钮之上）：`variants` 非空
  （即 `looks.length > 1`，含「基础」）才渲染，点击把 `variantOverride` 设成下一套、循环回基础；tooltip 里
  写下一套的名字。它是**循环**而不是选择器——精确挑某套用抽屉的 chips。它多占一格 40px，
  所以 `.wallpaper-follow` 用 `.wallpaper-tools.has-variants ~ .wallpaper-follow` 抬到 168px，别写死成第二个值。
  **段间过渡也用同一个 `blend`**：hook 在 `active`（序列进行中）
  或刚离开序列时对每次 target 变化做缓动，其余情况（首帧、抽屉滑块、换背景）直接贴值。
  两个通道和视差同源：背景写 `--backdrop-x/y/scale`、模型写 `design.transformRef`（`SpineStage` 里
  `d.transformRef.current ?? d.transform`）——**不要**把这些值搬进 React state，60fps 渐变会让整页 + 所有控件重渲染。
  背景的三个变量**只能有一个写者**：React 不再给 `.wallpaper-backdrop` 设 inline style，否则一次重渲染就会把画面
  掸回构图值、而渐变循环不会重跑。入场期间视差由 `useParallax` 的 `suppress`
  输入**缓动归零**（强度渐变到 0 / 恢复，不许换配置对象瞬间拍回）。
  这是唯一允许「壁纸画面跟随某个动画阶段改构图」的机制，不要在别处再开第二条。
- 构图设置抽屉（`features/wallpaper/components/WallpaperSettings.jsx`）里的数值一律是**设计像素**，
  进入渲染前同样走 `resolveLayerTransform()`，所以「面板调到 X」与「`wallpaper.config.json` 写 X」等价。
- 改默认配置**只改 `public/wallpaper.config.json`**（唯一事实来源，打包后仍可改、无需重建）：
  `config.js` 顶部静态 import 该 JSON 并 `mergeConfig` 进 `WALLPAPER`，兜底值自动跟随、不会漂移
  （`build:home` 的 `MODEL_ONLY` 也从这份 JSON 读 `modelId`）。新增字段仍要在 `BUILTIN_WALLPAPER` 留键并给默认值。
- **显示变体（`variant` / `variants`）**：同一模型的几套画面（通常 `loop` + `back1`、`loop_2` + `back2`），
  抽屉 chips 切换。实现在 `lib/variants.js`（纯函数，可 Node 复算）：
  - 变体是**覆盖集**，白名单 `VARIANT_KEYS` 之外的键一律忽略。`modelId` / `design` / `fit` / `overlay` /
    `letterbox` / `overscan` **永远不进白名单**：设计画布是所有偏移的单位，按变体变会把整份配置重新解释一遍。
  - `WallpaperPage` 里 `design` 一律由 **baseConfig.backdrop + baseConfig.design** 求得（`designBackdrop`），
    与当前变体无关；变体换背景只换 `<img>`，不改画布。后台预览同理（`ViewerPage` 的 `designBackdrop`），
    否则调试页看到的构图会和壁纸不一致。
  - **切变体不重载模型**，`handleLoaded` 不会再触发。`animation` / `expression` 靠 `WallpaperPage` 里那条
    `[config.animation, config.expression, info]` 的 effect 重新落轨道；删掉它就会「切了变体还播上一套的循环」。
  - 加载幕只 gate 首次（`clipsWarmRef`）：**不要**把 `setClipsReady(false)` 加回去，否则切变体会整屏再黑一次。
  - 抽屉 chips 不写 localStorage（和其它控件一致）；「记录配置」把 `variant` 写进文件，并把
    两层 transform / `parallax` / `clickAnimation` 写进**该变体**，不烘进 base 顶层
    （`configPayload` 里 `lookOf()` 是唯一入口：只有编辑「基础」时才 `Object.assign` 到顶层）。
    **两边都写就会在记录一次快照后把基础压成屏幕上那套，重载后两套一模一样。** `overlay` 例外，永远写顶层。
  - **`entrance.autoplay` 是全局键，例外于「变体各自独立」**：它描述「这张壁纸要不要自动放开场」，
    不是「这套画面长什么样」。`variantOverrides()` 通过 `GLOBAL_NESTED` 从任何变体的 `entrance` 里
    丢掉它，读取时顶层永远胜出；`entrance.blend` / `clips` 仍是逐套的。因此抽屉的 `configPayload`
    把 autoplay 写顶层、变体里剥掉，后台 `VariantConfigOf` 导出时同样剥掉，`ViewerPage.updateCompose`
    用 `withAutoplay()` 同步写进 `baseView` + 所有变体 view（否则切 chip 会看到文件无法表达的值）。
    不要把它改回「写进当前变体」——那正是「取消勾选后两边看着都关了、但只存了一套」的来源。
  - **记录后必须立刻生效**：`WallpaperSettings` 的 `onRecorded(payload, stored)` 回调把文档交回
    `WallpaperPage`（`setLoaded`），否则内存里还是记录前的 `config`，切走 chip 再切回来会看到
    「刚取消的勾选又勾上了」——存储其实是对的，只是被旧值盖住。别再改成「记录后提示重载」。
  - **「基础」本身就是一套画面，抽屉里也占一个 chip**（`variant: ''` = 顶层字段，和后台的「基础」chip 同一份）；
    因此 `variants` 只要有 1 项 chip 行就出现，不要恢复「≥2 项才显示」那种门槛——那会逼用户为了能切换
    去复制一份基础配置。`comp.variantBase` 是它的四语言标签。
  - 后台（`CompositionPanel` + `ViewerPage`）存的是**完整视图快照**（`viewOf(compose)`），不是部分覆盖：
    切换是拷贝而非合并，避免「没写的键继承了上一套」。`VIEW_KEYS` 是唯一分流依据，UI 键
    （`on` / `layer` / `layerKey` / `clip` / `follow` / `solo` / `design`）绝不能进变体。
  - 写回由 `viewToConfig()` 统一转换（sentinel → `null` / `''`、`sequence` 文本 → 数组、偏移取整），
    base 与每个变体走同一套，别在别处再拼一份 JSON。**顶层字段必须取自 `baseView`，不能取 `state`**：
    `state` 是「当前正在编辑的那个 chip」，拿它当 base 会把变体烘进基础（一次调参后两套一模一样，
    基础原来的背景 / 循环全丢）。`design` 是全局的，仍从 `state` 取。
  - **差分型兄弟动画不在变体能力内**：`cut_B_coat` / `cut_A_water` / `loop_bowl` 这类被 `clipLayers`
    折进 base 的素材无法靠切变体播出来，那要先给折叠逻辑加解包开关（单独排期，风险高）。

## 10. 路由（Routing）

- 路由零依赖（`src/app/router.js`，不引入 react-router）：判断路径**最后一段**为 `spine-viewer`，或 `#spine-viewer` / `?viewer`，
  其余一律落到壁纸 —— 这让 `file://` 与子路径托管都能工作。`file://` 下返回壁纸时要补 `index.html` 文件名。
- **`index.html` 里的尾斜杠规范化脚本不能删**：`base: './'` 下 `/spine-viewer/` 会让 `./assets/*` 解析到错目录。
- 只有两个页面，不引入路由表 / 懒加载路由；新增 feature 时在 `app/App.jsx` 加分发分支即可。

## 11. 错误处理（Error Handling）

- **壁纸页**：默认无 UI，只有加载失败或素材库为空时左下角显示一行纯文本，同时 `console.error`。
  不要加 toast / 弹窗 / 重试按钮（构图设置抽屉是唯一的例外，且必须保持收起状态）。
- **配置文件读取失败必须静默降级**：`loadWallpaperConfig()` 不 reject，返回内置默认值 + `source: 'builtin'`，
  `console.warn` 一条即可。ESM 构建在 `file://` 下 fetch 本地 JSON 必然失败，这是预期路径，不要当错误弹提示。
  （embed 构建不会走到 fetch：它先读注入的 `__BD2_WALLPAPER_CONFIG__`。）
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
- **两套产物，别混用**：`npm run build` 出 ESM（`<script type="module" crossorigin>` + 外链 CSS + `dist/models/**`），
  只能在 http / 浏览器里跑；`npm run build:we:embed`（`BD2_EMBED=1`）出 **file:// 自包含** 版本：IIFE 经典脚本、
  素材全部 base64 进 `assets/embed-assets.js`、配置进 `assets/embed-config.js`、`dist/models/` 不再存在。
  两者都只是 `vite build` 的开关差异，不是两套源码。
- **file:// 构建存在的原因**：Wallpaper Engine **2.8.797 beta** 起 CEF 156 默认禁止 file:// 页面跨源读本地文件，
  module 脚本 / `crossorigin` 样式表 / XHR 读 skel.atlas / `<img>` 读图集页全部被拦 → 黑屏。
  这是 beta 行为，正式版可能修，所以**默认部署（`build:we`）仍是普通产物**，embed 只是备选。
  WE 里黑屏时才换 `build:we:embed`，别把 embed 当默认。
  改 `vite.config.js` 的 `rollupOptions`、`index.html` 的 script 标签、或素材加载方式前先读
  `docs/we-file-access.md`。三处运行时桥接必须同时保持：
  `src/lib/assets.js` 的 `assetUrl()`/`embeddedAsset()` 查表（键 = manifest `source`，无 `models/` 前缀、未编码）、
  `useSpineAsset.js` 的 `manager.setRawDataURI()`（file → data URI）、
  `config.js` 的 `readConfigFile()` 优先读 `__BD2_WALLPAPER_CONFIG__`。
  缺任何一个都会退回到"请求 file://"并重新黑屏；`npm run verify:embed` 只覆盖前两项之一的产物形态，
  运行时行为仍需在 WE 里实测。
- iife 构建下 CSS 不会单独产出 `.css`：Vite 把它注入 JS chunk（`document.createElement('style')`），
  这是零请求路径，不要为了"样式要单独文件"去改 `format` 或加 `cssCodeSplit`。
- **`wallkit` 是源码直出的 git 依赖**（无构建步骤），所以 `vite.config.js` 里 `optimizeDeps.exclude: ['wallkit']`，
  由 Vite / `@vitejs/plugin-react` 自己编译它的 JSX。去掉这行会让 dev 预打包去处理它的 CSS import。
  升版本只改 `package.json` 的 commit sha（`github:mikoberry/wallkit#<sha>`），不要改成 npm 包或 vendor 副本。
- `wallkitWE()` 只是往 `index.html` 的 `<head>` 顶部注入 classic script（audio / media / pause，`timeline` 默认关）。
  它不改构图、不写 `project.json`；`dist/index.html` 里应能看到 `<!-- wallkit-we:* -->` 标记。
- **`index.html` 里的「媒体补登记」shim 不能删**。WE 的媒体状态一次页面加载只推一次，embed 产物首屏压着
  36MB `embed-assets.js`，那一次推送容易错过（表现为整块专辑卡片不出现、`__wallkitMedia` 全空，切歌才恢复）。
  shim 在 `load` 与 1.5/4/9/20s 时若数据仍空就重注册三个监听器；已有时 `empty()` 命中即 return，是 no-op。
  诊断对象 `__BD2_MEDIA__`（`nav` / `armedAt` / `hits`）一并保留。详见 `docs/we-file-access.md` §10.4。
- **性能读数默认关闭**（`features/wallpaper/components/StatsHud.jsx`），开关在抽屉「其他」标签，状态由
  `statsFlag.js` 唯一持有（`localStorage['bd2.stats']` + 内存副本 + `bd2:stats-change` 事件），
  显式存储值优先于 URL（否则 `?stats=1` 会让开关关不掉）。关闭时组件 `return null`、不启 rAF，零开销。
  `cpu` 指标来自 `SpineStage` 每 500ms 上报的 `__BD2_STAGE_STATS__`，**改渲染循环时别去掉这次上报**——
  vsync 锁 60 时它是唯一能看出主线程余量的数。实测基线：4070 / 1440p / overscan 1.5 下 `cpu ≈1.5ms`、
  `p95 16.8ms`、`buf 3840×2160`；瓶颈在填充率而非 JS，4K 时 `buf` 会到 `5760×3240`。

### WE 部署（`npm run build:we` / `build:we:embed`）

- `build:we` = 普通构建 + 部署（默认）；`build:we:embed` = 自包含构建 + 部署（beta WE 黑屏时用）。
- **发新壁纸（新工程目录）走 `npm run we:new`**（`scripts/new-wallpaper.mjs`）：内部就是
  `build-home.mjs --embed` + `deploy-weproject.mjs --target <新目录> --title <标题>`，不复制它们的逻辑。
  默认目录 `<myprojects>/<角色>_<皮肤>`，`--model` / `--name` / `--dir` / `--title` / `--save` / `--list` /
  `--dry` / `--force`；目录已存在且非空时**拒绝**（防止覆盖已发布工程的 `workshopid`）。
  **标题按 modelId 从 `publish/wallpaper.titles.local.json` 自动取**（本地文件、已 gitignore，代码不预置任何文案）：
  优先级 `--title` > mapping；`--save` 把当前标题记进 mapping，`--list` 打印现有条目。
  该文件的值可以是标题字符串，或 `{ title, dir }`（`dir` 固定工程目录名，相对 `myprojects`）。
  另有 `publish/wallpaper.titles.skill-cutscene.json`（同样本地）：键是 `<角色>/<皮肤>`，覆盖整个 skill_cutscene
  素材库（174 套），作为**低优先级**回退参与同一套匹配；`--save` 只写前一个文件。
  `--model` 与 `public/wallpaper.config.json` 不同时，它**只在构建期间临时改 `modelId` 再原样还原**：
  构图 / `sequence` / `backdrop` 仍沿用当前配置，这不是"按人物装载预设"，要连构图一起换就把
  `publish/wallpaper.presets.json` 里那一块整份覆盖进 `public/wallpaper.config.json`。
- **只构建不部署**：`npm run build:home:embed`（产物只在 `dist/`，不碰任何 WE 目录）。用户想用 WE
  编辑器自己「创建壁纸」导入、再自己管 `project.json` 时走这条，随后用
  `npm run project:latest`（自动取 `myprojects` 下**最近改动过**、也就是你上次在做的那个文件夹 —— 语义是
  「接着上次继续」；刚建好还没放东西的空文件夹可能比部署过的旧项目还「旧」，那种情况用 `--created` 改按创建时间）或
  `npm run project:gen -- --target "<新工程目录>"` 合并面板文案；完整流程见
  [docs/we-manual-import.md](docs/we-manual-import.md)。
  `--list` 先看候选（表头会写明按哪种时间排序）、`--dry` 只看差异不写盘。
  **标题不会被覆盖**：沿用目录里 `project.json` 现有的 `title`（每张壁纸有自己的名字），
  要让配置里的 title 生效得显式加 `--force-title`；`description` / 面板 properties 仍按配置写。

- `scripts/deploy-weproject.mjs` 默认目标
  `F:\SteamLibrary\steamapps\common\wallpaper_engine\projects\myprojects\BD2-test`，可用
  `--target <dir>`（跨 shell，推荐）或 `WE_PROJECT` 环境变量覆盖；
  它会写仓库外的文件，**只在用户明确要求时执行**。
- 只清 `assets/` / `models/` / `index.html` 三项，其它文件（`preview.gif`、WE 自己生成的快照等）必须保留；
  缩略图由 deploy 从 `publish/preview.gif` **播种**（目录里没有任何预览图时才复制），见下条。
- `wallpaper.config.json` **和其他文件一样直接覆盖**（部署目录是 `dist/` 的镜像）。它只是出厂默认值，
  所以覆盖它不会影响已经「记录」过的用户（那份在客户端的 `localStorage` 里）；想把这些值拿回仓库，
  用抽屉的「记录配置」复制出来再整份粘进 `public/wallpaper.config.json`；
  不要为了「一致性」改成每次覆盖。
- **embed 部署后这个 json 不再被读取**：配置已在构建时注入 `assets/embed-config.js`，调参必须改仓库里的
  `public/wallpaper.config.json` 再 `npm run build:we:embed`。脚本会检测 `assets/embed-assets.js` 是否存在来决定
  打印哪一种提示，不要删掉这个分支（`deploy:we` 复制一份已构建的 dist/ 也是合法用法）。
- `project.json` 由 `publish/project.config.js` + `wallkit/project` 生成，**唯一生成点在 `scripts/project-manifest.mjs`**
  （`deploy-weproject.mjs` 与 `gen-project.mjs` 共用）：`file: index.html`、`type: "Web"`（大写）、
  `general.supportsaudioprocessing: true`（**必须在 `general` 内**）、`schemecolor` 自动补在属性首位。
  `preview` 一定写进 `project.json`：先在目标目录里找 `preview.gif` / `preview.jpg` / `preview.png`
  （`detectPreview()`，deploy / project:gen / project:latest 共用），都没有就退回 `publish/project.config.js`
  的 `preview: 'preview.gif'`。**WE 只认 manifest 里声明过的文件名，不是扫目录**，所以先声明再让用户
  后拷图片是正确顺序；目录里真放了 `preview.png` 时以实际文件为准，不会被改指回 gif。
  默认图是 `publish/preview.gif`。`publish/` 是发布期元数据目录（清单声明 / 缩略图 / 标题表 / 配置库），
  `src/` 不 import 任何一项、也都不进 `dist/`；不要把这些放进 `public/`（那是站点运行时资源，
  会被原样复制到站点根、浏览器可直接访问）。`deploy` 只在目标目录**没有任何**预览图时
  才把它复制过去当种子，已有就不覆盖——所以自己的缩略图不会在重新部署时被默认图顶掉。
  `--title` / `WE_TITLE` 仍可覆盖 config 里的标题。
- **写回必须走 `mergeProject()`**：`workshopid` / `version` / `snapshotformat` / `snapshotoverlay` 是引擎自有字段，
  无条件保留（丢了 `workshopid` 会把下次发布变成新 Workshop 条目）；配置没声明的属性也保留，只有 `--prune` 才删。
  改面板文案跑 `npm run project:gen` 即可，不必重新构建。`html()` 区块只进 WE 属性面板、不推给页面，
  所以运行时不需要 `useWallpaperProperties()`；别把它接成 Vite 插件或运行时配置。
- 目标路径防护：段数 < 3 或等于仓库根时直接拒绝，避免误删。改这段时别放宽。

## 13. 验证方式（Verification）

按成本从低到高，不要越级；**agent 不做渲染验证**：

1. **语法与 import**：
   ```
   node_modules/.bin/esbuild src/main.jsx --bundle --external:react --external:react-dom --external:@esotericsoftware/spine-webgl --external:virtual:model-library --external:wallkit --external:wallkit/* --loader:.css=css --format=esm --outfile=/tmp/check.js
   ```
   退出码 0 = 语法与所有 import 路径解析成功（`wallkit` 本身由 Vite 编译，这里按外部依赖跳过）。
2. **纯 Node**：`npm run model:list`；构图数学校验直接 import `src/lib/composition.js` 的
   `compositionRects()` / `normalizeRect()` / `resolveEntrance()` / `blendLayerTransform()`；
   配置合并用 `mergeConfig()` 断言（空 override 等于默认值、
   嵌套部分覆盖、`_` 键被丢弃、`public/wallpaper.config.json` 的键与 `WALLPAPER` 一致）。
   这些文件顶层**不能**依赖 `import.meta.env` / `document`（否则 Node 无法 import），只在函数体内用 `document`。
   `lib/assets.js` 顶层读了 `import.meta.env.BASE_URL`，所以**不要**从构图 / 背景挑选模块转出它。
   抽屉的「记录配置」也要断言：未调整面板时，生成内容与 `public/wallpaper.config.json` **逐字节相同**。
   新增字段时必须同时出现在 `WALLPAPER` 与 JSON 的**同一位置**（键顺序 = 输出顺序），否则这条断言会挂。
   配置**优先级**用桩 `window.localStorage` + 桩 `fetch` 直接调 `loadWallpaperConfig()` 断言：
   无记录 → `source: 'file'`；`saveRecordedConfig()` 后 → `source: 'user'` 且记录里的值盖过文件；
   `clearRecordedConfig()` 后 → 又回到文件；`localStorage` getter 抛错时降级到文件且不抛。
3. **构建**：`npm run build`（仅用户明确要求时），核对 `dist/` 只含 manifest 引用的素材，
   且 `dist/wallpaper.config.json` 存在、文件名无 hash。
   **embed 构建**：`npm run build:we:embed`（或 `BD2_EMBED=1` 构建）之后跑 `npm run verify:embed`（不需要浏览器）。它断言
   `dist/index.html` 无 `type="module"` / `crossorigin` / 外链样式、三个 defer 脚本顺序为
   素材 → 配置 → 主脚本、CSS 确实注入在 JS chunk 里、`embed-assets.js` 的条目数与 MIME 及 PNG 魔数、
   `dist/models/` 不再存在、`embed-config.js` 的 `modelId` 与 `public/wallpaper.config.json` 一致。
   它**不覆盖运行时**（`setRawDataURI` 注入、data URI 图片能否被 WebGL 接受），那两项只能在 WE 里看。
4. **取色面板**：`src/features/wallpaper/color.js` 可在 Node 里直接 import，断言 `hsvToHex(hexToHsv(x)) === x`
   （含 `#000000` / 饱和色）与 `s`/`v` 越界裁剪；组件本身不做渲染验证。
5. **视差方向 / 比例**：`parallaxOffset(strength, design, { x, y })` 也是纯函数，断言
   「指针在左上 → 偏移为负（左上）」「负强度反向」「指针居中 → 0」「同一归一化指针在 1024 与 2048 画布上比例相同」。
6. **入场序列识别**：`pickEntranceSequence()` / `resolveSequence()` 是纯函数，用假动画列表断言
   `cut_A/cut_B` 与 `A_cut/B_cut` 两种拼写都能排对、`cut_A_water` 不会顶掉 `cut_A`、没有 cut 段时返回 `[]`、
   最后接 `loop_2`（其次 `loop`）。
7. **入场按段构图**：`resolveEntrance()` / `clipFraming()` 是纯函数，断言
   「未列出的段 → `1×` 无偏移、`backdrop: ''`」「`'10%'` 偏移换算成设计像素」「负/缺省 `blend` → 0」
   「`autoplay` 缺省 / 非 `false` → `true`」。面板的「复制完整配置」也要断言与
   `public/wallpaper.config.json` **逐字节相同**（`entrance` 块里键序必须是 `autoplay` → `blend` → `clips`
   → 段名 → `backdrop` → 两个 transform）。
8. **分层动画合并**：`mergeClipLayers(data)` / `detectClipLayers(list)` 是纯函数，可拿真 skel 跑（用
   `SkeletonBinary` + 桩 attachment loader 在 Node 里解析）。**必须跑播放比可见集合**，只数 timeline 看不出
   附件被 null 掉：`new Skeleton` + `AnimationState` 播到 2s，取 `drawOrder` 里有 attachment 的 slot 名。
   `Liatris/Sweet_Temptation` 折完 `cut_A` 应看到 190 个（base 135 + bowl 57 - 2 个被替代的副本），
   脸（`A_face_nomarl`）、脖子、马尾（`A_Ponytail17`）、碗（`A_bowl_back` / `A_Whippe1`）同时在，
   `A_arm_r4_fff` 可见而 `A_arm_r4_bbb` 不可见，slot 95/96/102/110/111 的 deform 还在；
   `Wilhelmina` 的 `A_water` 必须可见（base 写 null、层沉默 → setup 接管）；`loop_2` 不被卷入；
   `_idle`（不同长度）与 `_数字` 后缀一对都不能折；连跑两次 timeline 数不变。
9. 实际画面（入场接缝、渐变手感、构图观感）由用户自己在浏览器 / 壁纸宿主里确认。

**不要**跑无头浏览器、截图、Playwright 或任何浏览器自动化；不要在报告里把「构建通过」说成「验证通过」。

## 14. 开发流程与 Git（Development Workflow & Git）

- **不要自行启动 dev server / 不要留后台进程、服务或开放式前台命令。**
- 临时产物用完必须清理；某步卡住就终止、看输出、换更小的检查。
- 远程 `git@github-miko:mikoberry/browndust2-model-viewer.git`；本仓库 local 配置必须是
  `user.name=mikoberry` / `user.email=mikoberry@users.noreply.github.com`（**全局默认是另一个账号，别用**）。
- 提交信息用英文 conventional commits（`feat:` / `fix:` / `docs:` / `chore:`）。
- 用户默认只要**本地 commit，不主动 push**；提交大素材前先确认范围。

## 15. 常见改动路径（Common Patterns）

- **加模型**：把 `.skel` / `.json` + `.atlas` + 全部图集页 PNG 放进 `model-library/<角色>/<皮肤>/`，
  刷新即可；用 `npm run model:list` 核对图集页是否齐全。不要改 `src/` 去硬编码模型列表。
  背景随后跑 `npm run backdrops:add -- <6 位角色 ID>`：复制该桶并自动补 `.gitignore` 白名单。
- **清背景 / 换角色**：`npm run backdrops:prune` 会删掉无模型的桶并收缩白名单（先加 `-- --dry-run` 看清单），
  只删 `model-library/backdrops/` 下的桶，不碰上游。
- **改壁纸**：默认配置只改 `public/wallpaper.config.json`（唯一事实来源；`config.js` 静态 import 它，
  兜底值自动跟随）。这些都不参与调试页。
  **注意**：客户端一旦「记录配置」，那份 `localStorage` 快照会盖掉文件里的同名字段（见 §7 优先级），
  所以改文件只对没记录过 / 点过「恢复首次默认」/ 卸载重装的场景生效。
- **改调试 UI**：只动 `src/features/viewer/`；若某组件要复用到壁纸，先按 §3 提升到共享层。
- **加 / 调控件浮层**：只动 `WallpaperOverlay.jsx` + `overlay` 配置两处；组件 API 与 WE 接线细节查
  `node_modules/wallkit/README.md` 与 `node_modules/wallkit/docs/we-integration.md`（上游仓库
  https://github.com/mikoberry/wallkit），不要凭记忆猜 prop。
- **改相机 / 构图数学**：同时对照 `lib/spine/SpineStage.jsx` 的 `design` 分支与
  `lib/composition.js` 的 `compositionRects()`，并用 §13 的纯 Node 复算确认归一化矩形不变。
- **调入场构图 / 序列**：不要在壁纸抽屉里硬塞控件，去 `/spine-viewer` → 「构图」tab 调，再「复制完整配置」
  覆盖 `public/wallpaper.config.json`。壁纸抽屉只读展示当前值 + 「重新播放」。
- **加 feature**：在 `src/features/` 下自建目录（页面 + 专属 `components/` / `config.js`），
  在 `app/App.jsx` 增加分发分支；共享逻辑下沉到 `lib/`。

## 16. 参考文档

- [README.md](README.md) — 唯一对外文档（**英文，默认**）：AI 开发与免责声明、运行、路由、壁纸配置表、
  两层变换单位规则、目录结构。中文版是同目录的 [README.zh-CN.md](README.zh-CN.md)。
- **改 README 时两份都要改**（结构、章节标题、表格一一对应），先改英文再同步中文；`docs/` 仍只有中文。
- 早期 WE / wallkit 方案的设计文档（`docs/asset-research.md`、`docs/design-cutscene-wilhelmina.md`）**已删除**，不要再引用。
