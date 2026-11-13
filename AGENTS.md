# AGENTS.md

给在本仓库工作的 coding agent 的说明。**动手改代码前先读完本文件**；细节在 `docs/`，本文件只保留会直接导致改错东西的约束。

## 1. 项目是什么

《棕色尘埃2》（BrownDust 2）的 **Spine 网页壁纸**，跑在 Wallpaper Engine（WE）里。技术栈：

```
React 18 + JSX（无 TypeScript，沿用 wallkit 约定）
Vite 5 + @vitejs/plugin-react
@esotericsoftware/spine-webgl@4.1.56   ← 必须在 4.1 线
wallkit                               ← git 引用，锁 commit，不 vendored
```

当前形态：**单个 cutscene 场景 + wallkit 控件叠加**。方案定稿在 [docs/design-cutscene-wilhelmina.md](docs/design-cutscene-wilhelmina.md)，素材是 Wilhelmina「Iron_Monarch」（`cutscene_char067601`，2 页 2048²，站姿待机），spine 文件已在 `model-library/Iron_Monarch/`（见 §6）。

**当前进度**：脚手架已建立并验证（esbuild 整包解析通过、choreography 单测通过、`prepare:model` 已产出 2.82MB 素材）。src/ 结构见 §3；`npm install` 后即可 `npm run dev`。

> 仓库根目录的 `cutscene_char067902/` 是早期候选素材，**已弃用**（用户最终选定 Iron_Monarch）。不要拿它替换 067601；它也不该长期留在仓库根，确认后可删。

## 2. 分层（硬约束）

```
控件层  <Clock/> <Spectrum/> …            wallkit（git 引用，不在本仓库修改）
接线层  App：数据、时间、用户属性         本仓库
外壳层  WE 注入 / project.json / 部署脚本  本仓库
背景层  Backdrop（背景图）+ SpineStage    本仓库
```

三条不能破的边界：

- **控件层不知道背景是什么。** 不要把 spine 的 canvas 尺寸、skeleton 状态、视口坐标喂给 wallkit 组件；反过来也不要在 SpineStage 里 import 控件。
- **背景层不读 WE API。** `window.wallpaperPropertyListener`、音频、媒体信息只允许出现在 `src/we/` 与应用层，由 `App.jsx` 往下传。
- **wallkit 是外部依赖。** 需要改控件行为时，改的是本仓库传进去的 props，不是去改 `node_modules/wallkit`。真要改库，去 `D:\code\js\wallkit` 改、提交、再回来升级 commit 引用。

## 3. 目录（目标状态）

```
├── index.html                 # 挂载点；wallkitWE() 注入脚本由 Vite 插件完成
├── vite.config.js             # react() + wallkitWE({ audio: true, media: false })
├── project.json               # WE 工程描述，用户属性（combo / slider）在这里
├── public/models/wilhelmina/  # 生成物，不进 git（见 §6）
├── scripts/
│   ├── prepare-model.mjs      # 源资源 → public/models（WebP + 改 atlas + 放大背景）
│   └── deploy-wallpaper.mjs   # dist → WE 项目目录
└── src/
    ├── main.jsx
    ├── App.jsx                # 唯一编排点：舞台 + 背景 + 控件 + 数据
    ├── stage/
    │   ├── SpineStage.jsx     # WebGL canvas + 渲染循环 + 视差
    │   ├── useSpineAsset.js   # 加载 / 释放
    │   ├── choreography.js    # 动画状态机（纯函数，可单测）
    │   └── stageConfig.js     # 坐标系、构图、镜头常量
    ├── backdrop/Backdrop.jsx  # 背景图 + 暗角 + 呼吸
    ├── overlay/Overlay.jsx    # wallkit 控件编排
    ├── we/properties.js       # applyUserProperties 解析 + 默认值
    └── styles/global.css
```

## 4. 命令

工作目录是仓库根。脚手架建立后才有这些脚本：

- `npm install` — 安装依赖。
- `npm run dev` — Vite dev server。**由用户自己启动**，agent 不要起。
- `npm run prepare:model` — 从源资源生成 `public/models/wilhelmina/`。幂等，可重复执行。
- `npm run build` — 生产构建到 `dist/`。**只在用户明确要求时执行。**
- `npm run deploy:wallpaper` — 构建 + 同步到 WE 项目目录（默认 `F:\SteamLibrary\steamapps\common\wallpaper_engine\projects\myprojects\wallpaper`，`WE_PROJECT_DIR` 可覆盖）。

## 5. Spine 的坑（全部是实测踩出来的，不要凭直觉改）

1. **runtime 必须 4.1.x。** 本游戏 skel 是 Spine **4.1.11**。用 3.8 的 runtime（比如 anime-model-viewer 里那份 422KB 的 `spine-webgl.js`）解析会直接失败。用 npm 的 `@esotericsoftware/spine-webgl@4.1.56`，不要引入任何旧版单文件 runtime。

2. **`drawSkeleton(skeleton, premultipliedAlpha)` 第二位必须传 `false`。** BD2 的 atlas 没有 `pma` 标记，贴图是非预乘的。传 `true` 时角色立绘**看起来是对的**，但 cutscene / interaction 这类大面积半透明叠加会被一块白板盖住——这个错极易带进上线版本。

3. **cutscene 的 skel 不带背景。** 背景是同名 ID 的独立 PNG，**两个可能的来源**，找的时候都要看：

   - `ui\skill_cutscene_background\` —— 大多数套在这里（约 50% 覆盖率）。
   - `chibis\<角色>\<皮肤>\` —— 部分套在这里，命名是 `char067601_back1.png` / `_back1move.png` / `_back2.png`。**Iron_Monarch 就属于这种**，`ui\` 里一张都没有。

   识别规则：

   - `char061306back1.png` / `003401 back2.png` / `000303_back1.png` / `Char061305 back1-1.png` 四种写法混用 → 必须用正则匹配「6 位 ID + `back(\d+)` + 可选 `-(\d+)`」，不能按空格或下划线切分。
   - **带 `-N` 后缀的是局部层/遮罩**（alpha 均值 4–17），单独用就是废图。只有不带后缀的 `backN` 是完整场景。
   - **`*move` 变体是同一场景的低清版**（1024²），和 `-N` 后缀一样不要用。
   - Angelica 那套：`back1` 右半部透明、`back3` 是剑的局部图，只有 `back2` 可用。Iron_Monarch 那套：`back1` 是 2048² 王座厅（可用），`back2` 是 1024² 仰视天花板（配 `cut_A`/`loop` 那条线，本方案不用）。

4. **动画编排按素材的姿势线走，不要混用。** Iron_Monarch 有两条互斥的姿势线：

   | 动画 | 时长 | 姿势 |
   |---|---|---|
   | `loop_2` | 4.00s | 站姿持剑（**主待机**） |
   | `cut_B` | 3.33s | 站姿持剑（演出，与 `loop_2` 同姿势） |
   | `loop` | 8.00s | 背身弯腰（另一条线） |
   | `cut_A` | 3.43s | 背身弯腰 |

   `loop` / `loop_2` **不是长短版本**，是两套姿势各自的循环，不能"长短交替避机械感"。本方案只用 `loop_2` + `cut_B`；`loop` 作为可选彩蛋（默认关闭），`cut_A` 不用——从站姿切到背身弯腰会像换了个人。

   另外 `cut_B` 与 `loop_2` 动作差异极小，**点击演出几乎看不出来**，必须配镜头推近才有反馈（见设计文档 §6）。

5. **多页图集是 `_2.png` … `_N.png` 独立文件**，不是打成一张大图。转换 WebP 时页名必须同步改，否则 atlas 找不到贴图。

6. **角色立绘另有一条坑**（本期不用，但换素材时会遇到）：只播 `idle` 会得到一张白脸，五官靠独立的 `AttachmentTimeline`，必须叠第二条轨道 `state.setAnimation(1, '_faceN', true)`。

## 6. 资产流水线

- **spine 素材主源在仓库内**：`model-library/<皮肤名>/`（用户手动放入，当前 `Iron_Monarch/` 一套，skel+atlas 与游戏源逐字节一致）。`prepare-model.mjs` 从这里读，**不要**直接依赖 F 盘路径——那是兜底来源，仅当 `model-library/` 缺某文件（比如背景图）时才回退。
- **源资源只读。** `F:\live2d\BrownDust2\model-output` 是用户自己维护的解包产物，`model-library/` 里用户放入的文件同样只读不改。
- **生成物不进 git。** `public/models/` 已写进 `.gitignore`。仓库里只放 `scripts/prepare-model.mjs`，任何人 clone 后跑一次就能重建。
- **量化规则**：图集 PNG → WebP 质量 90（Iron_Monarch 实测 4.71+2.88MB → 0.75+0.47MB，-84%；背景 4.30MB → 0.42MB）；改完图名后同步改 `.atlas` 里**每一页**的页名行，`bounds` / `offsets` 不动。
- **背景文件不在 cutscene 目录里**：Iron_Monarch 的背景取自 `chibis/Wilhelmina/Iron_Monarch/char067601_back1.png`（2048²，原样转 WebP，不放大）。换素材时按 §5.3 的两条路径去找。
- 每套素材的规格、体积、bounds 记录在 [docs/asset-research.md](docs/asset-research.md)，加新素材前先读它，不要重新全量扫描。

## 7. Wallpaper Engine 约束

- **WE 里没有鼠标焦点和键盘焦点。** 任何页面内设置面板、悬停下拉、点击按钮都点不到。所有用户可配置项走 `project.json` 的 `combo` / `slider` 属性 + `wallpaperPropertyListener.applyUserProperties`，解析集中在 `src/we/properties.js`，并**必须在没有 WE 宿主时回退到默认值**（浏览器 dev 下要能正常跑）。
- **部署脚本不要用 Vite 的 `outDir` 直指 WE 目录。** 那里有 WE 编辑器写的 `preview.gif` 和用户改过的 `project.json`，`emptyOutDir` 会把它们吃掉。同步规则：`assets/` 整体替换，其余只覆盖同名产物，`project.json` 只在缺失时创建。
- 帧率目标 30fps 就够（WE 挂机功耗敏感）。切到后台 / WE 暂停时应停掉 rAF 循环。

## 8. 编码约定

- **注释用英文，文档和界面文案用中文。**
- 无 TypeScript：类型用 JSDoc 标注，不引入 `tsconfig`。
- 类名 BEM，本仓库前缀 `bd2-`（wallkit 自己用 `wallkit-`，不要混）。
- `choreography.js` 保持**纯函数 + 时间驱动、无副作用**，这样能直接在 node 里跑单测，不需要 DOM。
- 组件不自己起 `setInterval` 轮询时间；时间由应用层统一驱动后传下来（这同时是 wallkit `Clock` 的契约：`now` 必须由使用方传入）。
- 常量集中在 `stageConfig.js`（构图、镜头、背景参数），不要散落在组件里。

## 9. 执行规则

- **不要自行启动 dev server / 不要主动 `npm run build`。** 验证留给用户。
- 不要留下挂起的进程、服务或开放式前台命令。需要等待时用有界超时 + 轮询检查。
- 某步卡住或超时就终止、看输出、换更小的检查，不要等用户来打断。
- 报告完成前清理后台进程和临时依赖。
- 除非用户明确要求，不要跑 Playwright 之类的浏览器自动化；用户会自己在 WE 里逐项验证。
- Git：远程是 `git@github-miko:mikoberry/browndust2-model-viewer.git`（SSH 别名 `github-miko`），本仓库 local 配置必须是 `user.name=mikoberry` / `user.email=mikoberry@users.noreply.github.com`。全局默认身份是另一个账号，**不要用全局身份提交**。提交信息用英文 conventional commits（`feat:` / `fix:` / `docs:` / `chore:`）。

## 10. 验证方式

按成本从低到高，不要越级：

1. **语法与导入**：用相邻项目的 esbuild 校验打包，不额外安装依赖。
   ```
   node_modules/.bin/esbuild src/main.jsx --bundle --external:react --external:react-dom --loader:.css=css --format=esm --outfile=/tmp/check.js
   ```
   （esbuild 不装在本地时，借用 `D:/code/js/anime-model-viewer/node_modules/.bin/esbuild`。）退出码 0 = 语法和所有 import 路径都解析成功。
2. **纯函数**：`choreography.js`、`properties.js` 可直接用 node 动态 import 验证。
3. **渲染**：无头 Chrome 截图（`--headless=new --enable-unsafe-swiftshader --use-angle=swiftshader`），**截完立即关闭**。这要求用户已经开了 dev server。
4. 真正的验收只有一条：用户在 WE 里挂上去看。不要在报告里把"构建通过"说成"验证通过"。

## 11. 参考文档

- [docs/asset-research.md](docs/asset-research.md) — 全部资源分类的实测数据（体积、页数、骨骼数、动画名、坑）
- [docs/design-cutscene-wilhelmina.md](docs/design-cutscene-wilhelmina.md) — 本期壁纸的完整设计：构图、坐标系、动画编排、控件、WE 集成
- [README.md](README.md) — 对外简介
