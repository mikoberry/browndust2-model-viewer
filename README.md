# browndust2-model-viewer

《棕色尘埃2》（BrownDust 2）的 **Spine 壁纸 / 模型查看器**：React 18 + Vite 5 + `@esotericsoftware/spine-webgl@4.1.56`。
直接读取仓库里的 `model-library/`，不依赖 Wallpaper Engine 也能跑；壁纸页可选叠加
[WallKit](https://github.com/mikoberry/wallkit) 的控件浮层（时钟 / 频谱 / 专辑卡 / 氛围粒子 / 指针特效 / 聚光灯），
接上 Wallpaper Engine 后频谱与专辑卡会拿到真实的音频 / 媒体数据。

## 运行

```bash
npm install
npm run dev          # 根地址 = 壁纸；地址后加 /spine-viewer 进调试页
npm run build        # 产出 dist/（ESM：浏览器 / 静态托管用）
npm run build:we     # 默认：普通构建（真实素材文件）+ 部署到 Wallpaper Engine 项目目录
npm run build:we:embed  # 备选：file:// 自包含构建（素材 base64 内嵌）+ 部署
npm run verify:embed # 自检自包含产物（纯 Node，不需要浏览器）
npm run preview      # 预览构建产物
npm run model:list   # 命令行查看 model-library 扫描结果
```

**两种产物可以随时切换**，同一个 `dist/`：

| 命令 | 产物 | 素材 | 能跑在哪 |
| --- | --- | --- | --- |
| `npm run build` / `build:home` | ESM 多文件 | `dist/models/**` 真实文件 | 浏览器、http 静态托管、`npm run preview` |
| `npm run build:home -- --embed` | IIFE 单入口 + `embed-assets.js` | base64 内嵌，零请求 | 以上全部，**外加 file://** |

`build:we` = 普通产物 + 部署（默认），`build:we:embed` = 自包含产物 + 部署（备选）。

Wallpaper Engine **2.8.797 beta**（CEF 156，默认禁止 file:// 读本地文件）目前只跑得动 embed 那一份，
所以在这个 beta 上要 `npm run build:we:embed`；正式版若修复了 file 访问，`build:we` 的默认产物即可直接用。
部署脚本会检查目标目录里有没有 `assets/embed-assets.js` 来判定这次部署的是哪一种，并在日志里说明。

开发时直接访问 `http://localhost:5173/spine-viewer`。

## 两个路由

| 路径 | 用途 |
| --- | --- |
| `/`（以及其它所有路径） | **壁纸**：全屏固定模型 + 对应背景，默认零 UI |
| `/spine-viewer` | **开发调试辅助页**：完整查看器（模型库 / 工具栏 / 检查器 / 时间轴） |

根路由显示的模型、背景、构图与播放参数由随页面发布的 `wallpaper.config.json`（**唯一事实来源**）
和 `src/features/wallpaper/config.js`（静态 import 该 JSON 合并出的内置兜底值）决定——改默认配置只需改 JSON。

## 壁纸设置

壁纸页右下角手柄 / `S` 键打开设置抽屉，tab 分组：**构图 · 时钟 · 频谱 · 专辑卡 · 氛围 · 指针**
（聚光灯在「指针」tab 内的第二节，配置键仍是独立的 `overlay.spotlight`）。
改完点「记录配置」存进 `localStorage['wallpaper.config.user']`，此后启动按这份来；
`wallpaper.config.json` 只是出厂默认值（「恢复首次默认」回到它）。

配置优先级：内置默认值（已自动并入 JSON）< `wallpaper.config.json` < 用户「记录配置」。

### 按人物保存配置（人物配置库）

`wallpaper.presets.json`（仓库根目录，不进 dist）是手工维护的**人物配置库**（代码不读它）：给每个人物调好构图后，
抽屉里点「记录配置」，把剪贴板里的完整配置粘贴到该文件的 `presets` 下，用人物的 `modelId` 做键。
换人物时把想要的人物整块复制、覆盖到 `wallpaper.config.json` 刷新即可；若之前点过「记录配置」，
先在抽屉里点一次「恢复首次默认」（清掉 localStorage 快照）再刷新，文件才会生效。

## 部署到 Wallpaper Engine

```bash
npm run build:we        # 默认：普通构建（dist/models/ 真实文件）+ 部署
npm run build:we:embed  # 备选：file:// 自包含构建（素材 base64 内嵌）+ 部署
npm run deploy:we       # 只复制现有 dist/，不重新构建
```

目标目录默认 `F:\SteamLibrary\steamapps\common\wallpaper_engine\projects\myprojects\BD2-test`。
换目录用 **`--target`（推荐，cmd / PowerShell / bash 写法一致）**：

```bash
npm run build:we:embed -- --target "F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/BD2-embed"
npm run build:we       -- --target "F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/BD2-plain"
```

也可以用环境变量 `WE_PROJECT` / `WE_TITLE`，但那是 shell 相关的（bash 写 `WE_PROJECT=x npm run …`、
cmd 要先 `set "WE_PROJECT=x"`、PowerShell 要用 `$env:WE_PROJECT='x';`）。

`project.json` 由仓库根的 **`project.config.js`** 生成（`wallkit/project` 的 `defineProject` 保证形状、
`mergeProject` 保留 WE 编辑器写过的 `workshopid` / `preview` / `version`）。频谱 / 专辑卡需要的
`general.supportsaudioprocessing: true` 与 `type: "Web"` 由工具自动补齐；放一张
`preview.jpg|png|gif` 进部署目录即可作为缩略图。

想改 Workshop 标题、简介或属性面板里的自定义文案（头像、求点赞订阅、主页、致谢），只改
`project.config.js` 然后 `npm run project:gen` 即可，**不用重新构建**；`npm run project:check`
只报告漂移不写盘。面板文案用 `html()` 区块，引擎当 HTML 渲染且不会推给页面，所以壁纸运行时零改动；
GitHub 链接不在面板白名单里，主页用带颜色的 `<a>` 显示、仍需复制到浏览器打开；头像 `github.com/mikoberry.png` 则能正常显示。

### 什么时候需要「自包含」构建（`build:we:embed`）

Wallpaper Engine **2.8.797 beta** 把渲染内核升到 CEF 156（Chromium 156），**默认禁止 file:// 页面读取本地文件**。
普通构建（`npm run build:we` 的默认产物）在这个 beta 里会全灭：module 脚本、`crossorigin` 样式表、
Spine 读 skel/atlas 的 XHR、读图集页的 `<img>` 全部被拦 → 黑屏。

这是 beta 的行为，正式版可能恢复对 file 的访问，所以**普通构建仍是默认**；如果黑屏，改用
`npm run build:we:embed`。自包含产物**运行时不发起任何本地请求**：

- 入口打包成 IIFE，用经典 `<script defer src>`（无 `type="module"`、无 `crossorigin`）；
- 样式由 Vite 注入到 JS chunk 里（iife 下不产出外链 `.css`）；
- 素材（skel / atlas / 图集页 / 背景）全部 base64 进 `dist/assets/embed-assets.js`，
  运行时经 Spine 自带的 `setRawDataURI()` 通道解码，`dist/models/` 不再生成；
- 出厂配置注入 `dist/assets/embed-config.js`（`window.__BD2_WALLPAPER_CONFIG__`）。

**代价**：部署目录里的 `wallpaper.config.json` 在 WE 里不再被读取，调参要改仓库的
`public/wallpaper.config.json` 后重新 `npm run build:we:embed`。抽屉的「记录配置」（localStorage）
仍然优先于它。产物约 37MB（base64 放大约 33%），另有约 36MB 常驻内存。

细节与排障见 [docs/we-file-access.md](docs/we-file-access.md)。

### 想用 WE 编辑器自己导入

不想让脚本直接往工程目录里复制（新建工程、或想自己接管 `project.json`）时，只构建、不部署：

```bash
npm run build:home -- --embed     # 产物在 dist/，不碰任何 WE 目录
```

然后在 WE 里「创建壁纸」拖入 `dist/index.html`，再用手动指定的目标目录补面板文案：

```bash
npm run project:gen   -- --target "F:/.../wallpaper_engine/projects/myprojects/你的新工程"
npm run project:check -- --target "F:/.../wallpaper_engine/projects/myprojects/你的新工程"
```

完整步骤、手贴 `general` 的四条铁律与常见坑见
[docs/we-manual-import.md](docs/we-manual-import.md)。

## 性能自测

壁纸页内置一个**默认关闭**的运行时读数（`src/features/wallpaper/components/StatsHud.jsx`）：

**开关：抽屉 → 「其他」→ 显示左上角性能面板**（即时生效，不用重载，状态记在 localStorage 里）。

设备上打不开抽屉时（例如临时排查、给别人的包），还有两个 URL 逃生口：

```
index.html?stats=1
index.html#stats
```

左上角显示 `fps / p95 / worst / long`（近 1 秒）、`cpu`（每帧骨架更新 + 提交绘制的
主线程耗时，由 `SpineStage` 上报）、`heap`（`performance.memory`）、`buf`（WebGL drawing
buffer，即每帧真正着色的像素数）、`gpu`（真实显卡型号串）。
抽屉本身也会占一点性能，量读数时最好先把它关掉。

读法：

| 指标 | 健康值 | 超标说明 |
| --- | --- | --- |
| `p95` | ≤ 17ms（60Hz） | 平均 60 但 p95 超过 25ms 就是肉眼可见的顿 |
| `cpu` | ≤ 4ms（16.7ms 预算的 1/4） | vsync 锁 60 时 fps 看不出余量，这个才看得到。>8ms 时低频 CPU 会开始掉帧 |
| `long` | 0~1 / 秒 | 持续 >3 说明主线程被 JS 长任务占住 |
| `heap` | embed 构建常驻 36MB + 场景 | 换入场动画/背景后继续涨说明有泄漏 |
| `buf` | 与屏幕物理像素相同 | 4K + dpr 2 时填充率是集显的主要瓶颈 |

参考基线（测过的实际机器，方便判断新读数是否异常）：

| 机器 / 场景 | 读数 |
| --- | --- |
| RTX 4070，2560×1440 窗口，背景 5120×2880 × overscan 1.5 | `fps 60` / `p95 16.8ms` / `long 0` / **`cpu ≈1.5ms`** / `heap 169MB` / `buf 3840×2160` |

`cpu 1.5ms` 意味着主线程只用了 16.7ms 预算的 9%，还有约 10 倍余量 —— 这台机器的
瓶颈完全不在 CPU / JS 侧，而在填充率。所以「换台弱机器会不会卡」的答案取决于显卡与
分辨率，而不是代码效率：`buf` 达到 4K×overscan（`5760×3240`，约 1870 万像素/帧）时
才是集显的真考场。

## 添加模型

`model-library/` 递归扫描（`角色 / 皮肤` 两级组织），只读素材源：

```
model-library/
  Wilhelmina/
    Iron_Monarch/
      cutscene_char067601.skel     # 或 .json
      cutscene_char067601.atlas
      cutscene_char067601.png      # 多页图集是 xxx_2.png … 独立文件
  backdrops/
    067601/                        # 按 6 位角色 ID 分桶，文件名里的 ID 即关联键
      char067601_back1.png
```

- dev 由 Vite 插件按 `/models/<磁盘相对路径>` 直接读源文件；build 只输出 manifest 引用到的文件。
- `backdrops/` **只保留本地有模型的角色的桶**，既不入库也不留盘的多余桶没必要下载。
  加完新模型后跑 `npm run backdrops:add -- <6 位 ID>` 从上游补齐该桶并自动补进 `.gitignore` 白名单；
  `npm run backdrops:prune` 反向清理（删无模型的桶 + 收缩白名单）。

## 目录

按 feature-based 组织：`app/` 应用层、`features/` 两个独立的产品能力、`lib/` 共享技术层。

```
src/
  main.jsx
  app/                # 路由分发（App.jsx / router.js）
  features/
    wallpaper/        # 根路由正式壁纸（WallpaperPage + 设置抽屉 + WallKit 浮层）
    viewer/           # /spine-viewer 调试查看器
  lib/
    spine/            # 共享 Spine 引擎（SpineStage / useSpineAsset / clipLayers）
    composition.js    # 设计画布构图数学（唯一来源，可纯 Node 复算）
    backdrops.js      # 背景挑选
    animation.js      # 默认动画 / 表情挑选 + 入场序列识别
    assets.js         # 资源 URL
    uiScale.js        # 视口 → --ui-scale
  styles/global.css
model-library/        # 唯一素材源，只读
```

## 更多文档

- [壁纸与构图](docs/wallpaper.md) —— 设计画布基准、两层独立变换、入场序列与按段构图、配置文件详解
- [控件浮层 WallKit](docs/wallkit.md) —— 六个控件、WE 数据桥接、与构图的边界
- [实现要点](docs/implementation.md) —— Spine 技术坑、构图数学、架构约定
- [手动导入 WE 工程](docs/we-manual-import.md) —— 只构建不部署、WE 编辑器自己导入、手工维护 `project.json`

> `AGENTS.md` 是给 coding agent 的约束清单（架构规则、Spine 技术坑、构图数学、执行规则、Git 约定），
> 已与当前实现同步；使用方式与配置说明以本 README 为准。
