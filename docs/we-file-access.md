# Wallpaper Engine 2.8.797（CEF 156）file:// 限制的解决方案

> 状态：**已实施（P1–P3），WE 2.8.797 beta 内实测显示正常**。目标：在"新版默认禁止 file:// 页面读取本地文件"的宿主里，让壁纸照常启动、渲染、出模型。  
> 影响面：只影响 **自包含产物**（`npm run build:we:embed` / `BD2_EMBED=1`）。`npm run dev`、普通 `npm run build`、以及默认的 `npm run build:we` 行为不变。  
> 定位：这是 **beta 的兼容方案**。正式版若恢复 file 访问，默认的 `build:we` 直接可用，embed 可弃用。

---

## 1. 结论

把壁纸产物改成 **「file:// 自包含构建」（embed 模式）**：不再让浏览器去 `file://` 上取任何东西。

| 层                                   | 现状（被打断）                                                                                     | 目标                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| JS 入口                               | `<script type="module" crossorigin src>` → module 脚本强制走 CORS，file:// 下 origin 为 `null`，直接拒绝 | 打包成 **IIFE**，用经典 `<script src>`（无 `type`、无 `crossorigin`）       |
| 样式                                  | `<link rel="stylesheet" crossorigin>` → 同上                                                  | 内联成 `<style>`（当前 CSS 无 `url()` / `@font-face`，可安全内联）            |
| 素材（skel / atlas / 图集页 PNG / 背景 PNG） | Spine 用 `XMLHttpRequest` 取 skel+atlas，用 `<img>` 取图集页 → XHR 在 file:// 下全部被拦                  | 构建时转 base64，运行时经 **spine 官方 `setRawDataURI()` 通道**注入，完全不发请求     |
| 配置                                  | `fetch('wallpaper.config.json')` → 被拦，静默回落内置值                                               | 构建时注入 `window.__BD2_WALLPAPER_CONFIG__`，`readConfigFile()` 优先读它 |

一句话：**能内联的全内联，运行时不产生任何跨源请求**。

---

## 2. 为什么是黑屏（四条独立链路，缺一条都不行）

1. `index.html` 里是 `<script type="module" crossorigin src="./assets/index-*.js">`。ES module 加载规范要求 CORS，`file://` 的 origin 是 `null`，Chromium 只在 http/https/data 等 scheme 上支持 CORS → 报 `Access to script ... blocked by CORS policy`，Java**完全没执行**，`#root` 永远是空的。
2. `<link rel="stylesheet" crossorigin>` 同理（`crossorigin` 属性让它变成 CORS 请求）→ 样式也没加载。
3. 即使前两条修好，Spine 的 `AssetManager` 仍会 `new XMLHttpRequest()` 取 `.skel` / `.atlas`，并用 `new Image()` 取图集页。新版 CEF 不给 file:// 页面跨源读本地文件 → `Couldn't load binary/texture...`，模型无法构建，`onError` 之后画面是空的。
4. `fetch('wallpaper.config.json')` 被拦 → 回落内置配置（这条不致命，但等于"改 json 调参"在 WE 里失效）。

注意第 3 条：**只修 script/css 是没用的**，这是很多人卡住的地方。

---

## 3. 方案对比

| 方案                                     | 可行性                                  | 结论                                      |
| -------------------------------------- | ------------------------------------ | --------------------------------------- |
| A. 让 WE 放开本地文件访问（启动参数 / 设置项 / 回退稳定版）   | 只在你自己的机器上可控，发布给别人或换机器就失效；"默认禁止"是上游趋势 | ❌ 只作为**临时自救**（想立刻看到画面时回退 WE 稳定版），不做长期方案 |
| B. 起一个本地 HTTP 服务（`http-server` / Node） | WE web 壁纸只会加载你指定的 html，不会帮你起服务       | ❌ 不成立                                   |
| C. **资源内联 + 非模块打包**（本方案）               | 纯前端、无外部依赖、对宿主零要求                     | ✅ 采用                                    |
| D. 改成静态图 / 视频壁纸                        | 丢掉全部 Spine 能力                        | ❌                                       |

---

## 4. 选定方案：embed 构建

### 4.1 脚本与样式层（解决 CORS）

- `build:home` 已有的 `MODEL_ONLY` 只打包当前模型（dist 27MB，其中模型 11MB、背景 16MB），保留不动。
- 新增环境变量 `BD2_EMBED=1`（由 `build:we:embed` / `build-home --embed` 设置），在 `vite.config.js` 里切到：
  - `build.rollupOptions.output.format = 'iife'` + `inlineDynamicImports: true`
  - `build.modulePreload = false`（去掉 ESM 专用的 modulepreload polyfill）
  - `build.target` 仍为 `es2020`
- 新增插件 `scripts/embed-build-plugin.mjs`，`transformIndexHtml`（`order: 'post'`）阶段：
  - `<script type="module" crossorigin src="./assets/x.js">` → `<script src="./assets/x.js" defer>`
  - `<link rel="stylesheet" crossorigin href="./assets/x.css">` → 内联 `<style>…</style>`，并删掉对应 css 资源
  - wallkit 注入的 4 段内联 bridge 脚本**原样保留**（它们本来就是经典脚本）
- 两个页面（`/` 与 `/spine-viewer`）共用同一个 bundle，路由判断仍走 `location.pathname`，不受影响。

### 4.2 素材层（解决 XHR / 图片加载）

**构建期**（同一个插件的 `generateBundle`，`enforce: 'post'`，在 `model-library-plugin` emit 完素材之后）：

1. 遍历 bundle 里所有 `models/**` 资源，读原始字节 → base64，生成 `assets/embed-assets.js`：
   ```js
   self.__BD2_EMBEDDED_ASSETS__ = {
     "Tenka_Izumo/Ame-no-Mitori/cutscene_char021201.skel": "data:application/octet-stream;base64,...",
     "Tenka_Izumo/Ame-no-Mitori/cutscene_char021201.png":  "data:image/png;base64,...",
     "backdrops/021201/char021201_back4-upscal4x.png":     "data:image/png;base64,..."
   }
   ```
   键 = manifest 里每个文件的 `source`（相对 `model-library/` 的 posix 路径，天然唯一、与磁盘布局无关）。
2. 从 bundle 中**移除**这些 `models/**` 资源（不再写盘，避免 27MB 存两份）。
3. 在 `index.html` 主脚本**之前**注入 `<script src="./assets/embed-assets.js"></script>`（经典脚本，file:// 下同目录 script 不受 CORS 限制）。

**运行期**（改动很小，且只在表存在时生效）：

- `src/lib/assets.js`：`assetUrl(rel)` 先查表（用去前缀的相对路径匹配），命中返回 data URI。背景 `<img>`、`background-image` 预热、`probe.decode()` 全部自动跟着走。
- `src/lib/spine/useSpineAsset.js`：`new AssetManager(...)` 之后，对 `[model.skeleton, model.atlas, ...model.pages]` 逐个  
  `manager.setRawDataURI(file.file, table[file.source])`。  
  这是 spine 运行时**自带的离线通道**：
  - `downloadBinary` / `downloadText` 命中 `rawDataUris` 时直接 `atob` 解码，不发 XHR；
  - `loadTexture` 命中时把 data URI 直接赋给 `img.src`（data: 图片不会污染 canvas，WebGL 上传安全）。
  - 键必须是 `model.skeleton.file` 这类**相对模型目录的文件名**（spine 内部会拼 `pathPrefix`，`setRawDataURI` 也会拼，两边一致）。
- 表不存在时（dev / 普通 build）整段逻辑跳过，返回值与现在完全一致。

### 4.3 配置层（保住"能调参"）

- 构建时把 `public/wallpaper.config.json` 内容注入 `self.__BD2_WALLPAPER_CONFIG__ = {...}`（写在 `embed-assets.js` 或独立的 `embed-config.js`，建议独立，方便手改）。
- `features/wallpaper/config.js` 的 `readConfigFile()`：**先查 `window.__BD2_WALLPAPER_CONFIG__`**，命中就当作"文件内容"返回（`source` 仍为 `'file'`，`url` 记为 `embedded:wallpaper.config.json`），未命中才走原来的 `fetch`。
- 优先级不变：内置 < 注入的工厂默认 < 抽屉「记录配置」的 localStorage 快照。

**代价（需要你接受）**：WE 里改 `wallpaper.config.json` 不再即时生效——要改仓库的 `public/wallpaper.config.json`（或 `wallpaper.presets.json` 里对应那一份）然后重新 `npm run build:we:embed`。抽屉里的实时调参 + 「记录配置」仍可用（前提见 6.3）。

### 4.4 部署脚本

`scripts/deploy-weproject.mjs`：

- `MANAGED` 保持 `['assets', 'models', 'index.html']`（embed 模式下 `models/` 已不产出，清理逻辑照旧无害）。
- `wallpaper.config.json` 仍然复制过去（人可读、也是将来放开 file 访问时的退路），但同时在日志里说明它在 WE 里**不再生效**。
- 日志里打出 embed 模式的体积（预计 ~36MB 的 `embed-assets.js`），避免误以为是 bug。

---

## 5. 兼容矩阵

| 场景                                 | 产物                                | 素材加载               | 配置来源                                   |
| ---------------------------------- | --------------------------------- | ------------------ | -------------------------------------- |
| `npm run dev`                      | 无变化                               | `/models/*` 中间件    | `public/wallpaper.config.json` (fetch) |
| `npm run build` + `preview` / 静态托管 | 无变化（ESM 多文件）                      | http 取 `models/**` | 文件 fetch                               |
| `npm run build:home`               | 同上，但只含 home 配置的那一个模型               | 同上                 | 同上                                     |
| `npm run build:we`（默认）            | 同 `build:home`，只是多一步部署             | 真实 `models/**` 文件  | 文件 fetch                               |
| `npm run build:we:embed`（备选）      | IIFE + 内联 CSS + `embed-assets.js` | 查表 data URI，零请求    | 注入对象 → 回落 fetch → 内置                   |
| `dist/index.html` 直接双击（file://）    | 只有 embed 可用                       | 同上                 | 同上                                     |

**切换方式**：产物形态由 `BD2_EMBED` 决定，与部署动作正交。

```bash
npm run build                    # ESM（全库）      → 浏览器 / 静态托管
npm run build:home               # ESM（单模型）    → 浏览器 / 静态托管
npm run build:home -- --embed    # 自包含           → 以上全部 + file://
npm run build:we                 # ESM 单模型 + 部署到 WE（默认）
npm run build:we:embed           # 自包含 + 部署到 WE（WE 2.8.797 beta 用这个）
npm run deploy:we                # 只复制现有 dist/，产物形态原样带过去
```

默认走普通产物是因为「禁止 file 访问」是 **2.8.797 beta 的行为**，正式版可能恢复；届时 `build:we`
直接可用，不需要记得改回来。`deploy:we` 不重新构建 —— 它复制的是 `dist/` 当前内容，所以
「先 `build:home` 再 `deploy:we`」和 `build:we` 等价；脚本会检查目标目录里有没有
`assets/embed-assets.js` 来判定形态，普通产物会打印「若在 2.8.797+ beta 里会黑屏、改用
`build:we:embed`」的提醒。

---

## 6. 体积、性能与风险

### 6.1 体积与内存（当前实测：12 个文件 / 26.9MB 原始素材）

**磁盘**

- 素材 26.9MB → base64 35.9MB 的 `embed-assets.js`；入口 JS 611KB；CSS 0 字节（iife 下注入 JS chunk）。
- `dist/` 总量 37MB，`dist/models/**` 不再生成 —— 素材从「27MB 真实文件」变成「36MB 文本」，磁盘多约 9MB（base64 的 4/3 膨胀）。

素材构成（这份配置 `Tenka_Izumo/Ame-no-Mitori/cutscene_char021201`）：

| 类别 | 原始 | base64 |
| --- | --- | --- |
| 背景 6 张（`backdrops/021201/*`） | 15.98 MB | 21.3 MB |
| 图集页 4 张（`cutscene_char021201*.png`） | 9.57 MB | 12.8 MB |
| 骨架 `.skel` | 1.36 MB | 1.8 MB |
| `.atlas` 文本 | ~KB | ~KB |

**内存（这一步最容易误解）**

| 项 | 增量 | 是否常驻 |
| --- | --- | --- |
| `embed-assets.js` 里的 base64 字符串表 | +36MB | **是，永久**。它是模块顶层的对象字面量，一直被引用，GC 不会回收 |
| `.skel` 解码：`atob` 中间串 + `Uint8Array` | +约 3MB | 否，解析成 skeleton 后即可回收 |
| 图集页 PNG | **0** | 图集页走 `img.src = data:`，浏览器内部解码成 RGBA 纹理后上传 GL —— 占多少只取决于图片**像素尺寸**，跟来源是文件还是 data URI 完全无关 |
| 首次解析 36MB JS 源码时的源码文本 | 约 +36MB | 否，解析完可回收 |

所以「比现在多」的**常驻**部分是 **约 +36MB**（那份 base64 表），加载瞬间峰值再多几 MB（skel 解码），
外加解析期的瞬时波动。之前这里写的「40~50MB」偏高且概念不准：它把图集页算了进去，而图集页根本不做 `atob`。

这 36MB 是 embed 模式的固有代价 —— 只要素材以 base64 内嵌就躲不掉（除非不内嵌，也就是回到 file:// 请求，
而那正是新版 WE 禁止的）。要压小只能压素材本身：转 WebP、或只内联实际显示的那张背景。

### 6.2 启动时间

- 解析 36MB 脚本 + `atob` 解码，预估比现在多 **200~600ms**（WE 里已有全屏 loading 遮罩，感知不到）。
- 不可接受时的分级优化（放在 P3，先不做）：
  1. 图集页 / 背景 PNG 转 WebP 再 base64（体积降 60~70%）；
  2. 只内联"配置实际引用"的背景（当前 `backdrop` 是单张 `char021201_back4-upscal4x.png`，另外 5 张是给入场 clip 备用的）；
  3. 按图集页拆多个 `embed-assets-N.js`（只减解析峰值，不减总量）。

### 6.3 其余风险

| 风险                                                          | 概率 | 处理                                                                                      |
| ----------------------------------------------------------- | -- | --------------------------------------------------------------------------------------- |
| `data:` 图片 + spine 固定设置的 `image.crossOrigin='anonymous'` 被拒 | 低  | B 计划：覆盖 `manager.loadTexture`，改用 `URL.createObjectURL(blob)`（blob 是同源，绝对不污染 canvas）     |
| file:// 下 `localStorage` 不可用 → 「记录配置」失效                     | 中  | 代码已有 try/catch 兜底（回落到注入的工厂默认）；实测确认后决定是否在抽屉里提示                                           |
| IFFE 打包触发 Vite 警告 / 预加载 polyfill 残留                         | 中  | 已规划 `modulePreload:false` + 单入口 + `inlineDynamicImports`；构建后断言 `index.html` 不含 `module` |
| 极端情况：CEF 连经典 `<script src>` 也拦                              | 极低 | 终极兜底：把主 JS 也内联进 `index.html`（同一插件的开关），产物变成单文件                                           |
| 未来 WE 恢复 file 访问                                            | 中  | embed 产物在 http 下同样能跑，只是白背 36MB；不设 `BD2_EMBED` 就是普通产物（现在的默认）                     |

---

## 7. 验证方式（遵守项目约定：不跑无头浏览器/截图）

1. `npm run build:we:embed` 成功，无 Vite 报错。
2. 新增 `scripts/verify-embed.mjs`（纯 Node）断言：
   - `dist/index.html` 不含 `type="module"`、不含 `crossorigin`、含 `<style>`；
   - `embed-assets.js` 的键数量 = `model:list` 里当前模型的 skel+atlas+pages+backdrops 数（当前 12）；
   - 每个值以 `data:` 且含 `;base64,`；`.skel` 解码后前 1 字节合法；`.png` 解码后前 8 字节是 PNG 魔数；
   - `embed-config.js` 里 `modelId` 与 `public/wallpaper.config.json` 一致。
3. 你侧实测：WE 里重载壁纸 → 出模型即通过；若不行，用 WE 设置里的 CEF devtools 端口（如 8080）看 console 剩下哪条报错，据此切 B 计划。

---

## 8. 不改动的东西

- 不改素材目录结构、不改 `scan-model-library.mjs` / `model-library-plugin.mjs` 的既有职责（embed 插件只消费 manifest 与已 emit 的产物）。
- 不改两个路由、不改 `lib/spine/SpineStage.jsx` 的渲染与相机逻辑（只动 `useSpineAsset` 的资源注入 + `assets.js` 的 URL 解析）。
- 不给 `lib/` 引入 DOM/Node 专属依赖，`lib/composition.js` / `backdrops.js` / `animation.js` 的"可纯 Node 复算"性质保持。
- 不新增 npm 依赖（不引 `vite-plugin-singlefile`，插件自己写，约 120 行）。

---

## 9. 实施阶段

| 阶段     | 内容                                                                             | 产出                    |
| ------ | ------------------------------------------------------------------------------ | --------------------- |
| P1     | `vite.config.js` embed 分支 + `embed-build-plugin.mjs`（脚本/CSS 重写）                | 骨架能跑，无 CORS 报错但素材仍未加载 |
| P2     | 素材 base64 + `setRawDataURI` 注入 + `assets.js` 查表 + 配置注入                         | 模型能出来（核心目标）           |
| P3     | `verify-embed.mjs` + `deploy-weproject.mjs` 日志/文档同步（README / AGENTS.md §构建 一节） | 可复现、可回归               |
| P4（可选） | 体积优化（WebP 重编码 / 背景按需）                                                          | 36MB → 约 10~14MB      |

需要你拍板的两点：**① 接受"WE 里改 json 不再即时生效，要重新构建"吗**；**② 36MB 体积是否可接受，还是直接连 P4 的 WebP 重编码一起做**。


---

## 10. 实施记录（与设计的差异）

| 项 | 设计预期 | 实际实现 |
| --- | --- | --- |
| CSS | 插件把 `<link>` 内联成 `<style>` | **没发生，也不需要**：Rollup 只在 `es`/`cjs` 格式下才产出独立 `.css` 资源；`iife` 下 Vite 直接把样式注入 JS chunk（`document.createElement('style')`），同样零请求。插件里的 link 内联保留为兜底（当前是 no-op），自检改为断言"CSS 在 JS 里 + 无外链样式表" |
| 素材 | 27MB → base64 36MB | 12 个文件 / 26.9MB → `assets/embed-assets.js` 35.9MB；入口 JS 611KB（iife，无 modulepreload）；`dist/models/` 不再生成 |
| 构建耗时 | — | 约 1.8s（`✓ built in 1.80s`） |
| 配置 | 注入 `__BD2_WALLPAPER_CONFIG__` | 独立 `assets/embed-config.js`（3.3KB，字符串是原始 JSON，可直接手改再重新部署） |

### 10.1 实施中发现并修掉的坑

`assetUrl()` 的调用方传的是 manifest 的 `url`（`models/backdrops/…`，且路径段被 encode 过），
而表键是 `source`（无 `models/` 前缀、未编码）。初版直接查表会**永远 miss**，然后悄悄退回
`file://` 请求——画面依旧是黑的，而且没有任何报错提示。现在 `embedKey()` 同时剥前缀 + `decodeURIComponent`，
两种调用形态都能命中。改动 `assets.js` 的查表逻辑时务必保住这两步。

### 10.2 仍需在 WE 里确认的两件事

1. **data: 图片 + `crossOrigin='anonymous'`**：Spine 的 `loadTexture` 固定给 `<img>` 设
   `crossOrigin='anonymous'` 再把 data URI 赋给 `src`。按规范 data: 属于可跨源读取的 scheme，
   预期可用；若实测报错或纹理全黑，改走 B 计划（覆盖 `manager.loadTexture`，用 `URL.createObjectURL(blob)`）。
2. **file:// 下 `localStorage` 是否可用**：决定抽屉「记录配置」还能不能留住调整。不可用时行为已兜底
   （回落注入的工厂默认），只是每次启动都回到 json 里的值。

### 10.3 回滚

`BD2_EMBED` 不设即为原 ESM 构建（`npm run build`）。WE 若在后续版本恢复 file 访问，
直接改用 `vite build` 的产物即可，embed 产物在 http 下同样能跑，只是白背 36MB。
