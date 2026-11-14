# browndust2-model-viewer

《棕色尘埃2》（BrownDust 2）的 **Spine 壁纸 / 模型查看器**：React 18 + Vite 5 + `@esotericsoftware/spine-webgl@4.1.56`。
直接读取仓库里的 `model-library/`，不依赖 Wallpaper Engine 也能跑；壁纸页可选叠加
[WallKit](https://github.com/mikoberry/wallkit) 的控件浮层（时钟 / 频谱 / 专辑卡 / 氛围粒子 / 指针特效 / 聚光灯），
接上 Wallpaper Engine 后频谱与专辑卡会拿到真实的音频 / 媒体数据。

## 运行

```bash
npm install
npm run dev          # 根地址 = 壁纸；地址后加 /spine-viewer 进调试页
npm run build        # 产出 dist/
npm run build:we     # 打包 + 部署到 Wallpaper Engine 项目目录
npm run preview      # 预览构建产物
npm run model:list   # 命令行查看 model-library 扫描结果
```

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
npm run build:we     # = vite build + scripts/deploy-weproject.mjs
npm run deploy:we    # 只复制现有 dist/，不重新构建
```

目标目录默认 `F:\SteamLibrary\steamapps\common\wallpaper_engine\projects\myprojects\BD2-test`，
可用 `WE_PROJECT=D:/somewhere` 覆盖、`WE_TITLE` 改工程标题。

脚本会生成 `project.json`（`type: "Web"`、`general.supportsaudioprocessing: true`，频谱 / 专辑卡需要）。
放一张 `preview.jpg|png|gif` 进部署目录即可作为缩略图。

## 添加模型

`model-library/` 递归扫描（`角色 / 皮肤` 两级组织），只读素材源：

```
model-library/
  Wilhelmina/
    Iron_Monarch/
      cutscene_char067601.skel     # 或 .json
      cutscene_char067601.atlas
      cutscene_char067601.png      # 多页图集是 xxx_2.png … 独立文件
  skill_cutscene_background/       # 可选：共享背景图库（按 6 位角色 ID 自动关联）
```

- dev 由 Vite 插件按 `/models/<磁盘相对路径>` 直接读源文件；build 只输出 manifest 引用到的文件。
- 共享背景库不进 git（`.gitignore` 排除），本地保留供扫描器读取。

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

> `AGENTS.md` 是给 coding agent 的约束清单（架构规则、Spine 技术坑、构图数学、执行规则、Git 约定），
> 已与当前实现同步；使用方式与配置说明以本 README 为准。
