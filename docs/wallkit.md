# 控件浮层（WallKit）

壁纸页可以叠加 [WallKit](https://github.com/mikoberry/wallkit) 的控件：时钟、音频频谱、专辑卡、氛围粒子、
指针特效、聚光灯。分工是**WallKit 只做展示**（纯 props、不感知背景），本项目提供背景层并把宿主数据喂给它。

## 依赖与构建

`wallkit` 通过 **GitHub git 引用**分发（不发布 npm），并且是**源码直出、没有构建步骤**：

```json
"wallkit": "github:mikoberry/wallkit#<commit-sha>"
```

因此 `vite.config.js` 里加了 `optimizeDeps.exclude: ['wallkit']`，让 Vite / `@vitejs/plugin-react`
自己编译它的 JSX。升级只改这一行的 commit sha。组件 CSS 由组件自身 import（`wallkit/styles` 提供
`--wallkit-*` 主题变量），不并入 `global.css`。

## 六个控件

| 控件 | 配置键 | 需要的数据 | 默认 |
| --- | --- | --- | --- |
| 时钟 | `overlay.clock` | 无（自己每秒 tick 一次） | **开**，`minimal` 布局、左下角 |
| 音频频谱 | `overlay.spectrum` | WE 音频帧 | 关 |
| 专辑卡 | `overlay.albumArt` | WE 媒体信息 | 关 |
| 氛围粒子 | `overlay.ambient` | 无（飘雪 / 樱花 / 气泡 …） | 关 |
| 指针特效 | `overlay.pointer` | 指针事件（自己监听 window） | 关 |
| 聚光灯 | `overlay.spotlight` | 指针事件（自己监听 window） | 关 |

全部由 `wallpaper.config.json` 的 `overlay` 段控制，逐项 `enabled`；全关时 `WallpaperOverlay` 直接返回 `null`，
页面恢复成纯壁纸。改完刷新即生效，也可以直接在壁纸页的**设置抽屉**里调（控件各占一个 tab，实时预览），
调好点「记录配置」就存进本机。**聚光灯没有单独 tab**：它和指针特效同为「铺满全屏、只吃指针事件」的一层，
所以放在「指针」tab 里的第二节，但配置仍是独立的 `overlay.spotlight`，两者可以分开开关。

```json
"overlay": {
  "accent": "#a8c4ff",
  "clock": { "enabled": true, "placement": "minimal", "anchor": "bottom-left", "offsetX": 4, "offsetY": 4 },
  "spectrum": { "enabled": true, "variant": "bars", "width": "100vw", "height": "14vh", "anchor": "bottom-center" },
  "albumArt": { "enabled": true, "variant": "classic", "anchor": "top-left", "offsetX": 4, "offsetY": 4 },
  "ambient": { "enabled": true, "variant": "sakura", "density": 100 },
  "pointer": { "enabled": true, "trailVariant": "glow", "clickVariant": "ripple" },
  "spotlight": { "enabled": true, "size": 420, "feather": 0.45, "dim": 0.72, "glow": 0.22, "smoothing": 0.05 }
}
```

几条容易踩的约定：

- **`anchor` + `offsetX` / `offsetY`**：9 个锚点（四角 + 四边中点 + 居中），偏移从锚点**向内**计；数字是视口百分比，
  字符串是任意 CSS 长度（`'100px'`）。`0` 恒等于贴边。**铺满全屏的三层没有这套参数**：
  `ambient` / `pointer` / `spotlight` 不认 `anchor`，位置由「铺满视口」决定。
- **`size` / `width` / `height`**：控件尺寸。频谱与专辑卡还接受 `width` / `height` 精确覆盖盒子。
  `variant` 见上游 README（时钟 10 种、频谱 9 种、专辑卡 11 种）。专辑卡的 `wall` 布局已被上游移除，
  配置里残留会自动回退成 `classic`。
- **聚光灯的 `size` 是屏幕像素直径（80–3000），不是百分比**：它是唯一不随控件缩放的比例项；
  `feather` / `dim` / `glow` / `smoothing` 都是 0–1（`smoothing` 上限 0.5 秒）。
- **`accent`** 是主题色，作用于频谱 / 粒子 / 指针特效；时钟与专辑卡的文字色为空时跟随 `accent`
  （时钟 `color`、专辑卡 `textColor` 可单独覆盖）。聚光灯不读 `accent`，它自带
  `darkColor` / `lightColor`（默认纯黑 / 纯白）。

## Wallpaper Engine 数据桥接

`vite.config.js` 里的 `wallkitWE()` 会把音频 / 媒体 / 暂停三段监听器以 **classic script** 注入 `index.html`
的 `<head>` 最前面（必须早于模块入口，否则会丢首帧）。普通浏览器里这些全局函数不存在，脚本自动跳过——
所以浏览器里**时钟照常走，频谱是平的、专辑卡不渲染**，这是库的规定行为，不会用假数据兜底。

要在 WE 里真的出数据，需要一份 `project.json`——**`npm run build:we` 会自动生成**：

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
- 暂停由 `useWallpaperPaused()` 分发：时钟停止 tick、频谱 / 粒子 / 指针特效 / 聚光灯冻结。

## 与构图的边界

- 浮层在 `.wallpaper-overlay` 里（`position: absolute; inset: 0; z-index: 5`），**在 `.wallpaper-design` 之外**，
  锚定的是**视口**：改 `fit` 或缩放设计画布都不会移动 / 放大控件。
- 层级：背景与模型 < 浮层（5）< 构图手柄（6）< 设置抽屉（7）。`AmbientFx` 在浮层内部压在最下面
  （ambient 1 → 频谱 3 → 指针 4 → 时钟 / 专辑 5 → 聚光灯 6），雪从时钟背后穿过，聚光灯的遮罩则把时钟一起压暗。
- 浮层不参与构图计算，也不改变「画面永不响应指针」这条规则：`PointerFx` / `Spotlight` 只是装饰覆盖层，默认关闭。
- WE 桌面壁纸默认不投递鼠标事件：想让指针特效或聚光灯在实机看到，要在 WE 里为该壁纸开启鼠标交互。
  两者收不到事件时都不会兜底——指针特效画布留空，聚光灯遮罩保持全透明（不会把桌面压黑）。
  背景里若已经叠了 WE 自带粒子层，就不要再开 `ambient`。
