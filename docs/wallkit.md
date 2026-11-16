# 控件浮层（WallKit）

壁纸页可以叠加 [WallKit](https://github.com/mikoberry/wallkit) 的控件：时钟、音频频谱、专辑卡、氛围粒子、
天气光照、指针特效、聚光灯，以及画面级的取景框。分工是**WallKit 只做展示**（纯 props、不感知背景），
本项目提供背景层并把宿主数据喂给它。

## 依赖与构建

`wallkit` 通过 **GitHub git 引用**分发（不发布 npm），并且是**源码直出、没有构建步骤**：

```json
"wallkit": "github:mikoberry/wallkit#<commit-sha>"
```

因此 `vite.config.js` 里加了 `optimizeDeps.exclude: ['wallkit']`，让 Vite / `@vitejs/plugin-react`
自己编译它的 JSX。升级只改这一行的 commit sha。组件 CSS 由组件自身 import（`wallkit/styles` 提供
`--wallkit-*` 主题变量），不并入 `global.css`。

## 七个控件 + 取景框 + 喷射按钮

| 控件 | 配置键 | 需要的数据 | 默认 |
| --- | --- | --- | --- |
| 时钟 | `overlay.clock` | 无（自己每秒 tick 一次） | **开**，`minimal` 布局、左下角 |
| 音频频谱 | `overlay.spectrum` | WE 音频帧 | 关 |
| 专辑卡 | `overlay.albumArt` | WE 媒体信息 | 关 |
| 氛围粒子 | `overlay.ambient` | 无（飘雪 / 樱花 / 气泡 / 繁星 …） | 关 |
| 天气光照 | `overlay.light` | 无（指针只让它偏移一点） | 关 |
| 指针特效 | `overlay.pointer` | 指针事件（自己监听 window） | 关 |
| 聚光灯 | `overlay.spotlight` | 指针事件（自己监听 window） | 关 |
| 取景框 | `overlay.frame` | 无（纯 CSS，不计时） | 关 |
| 喷射按钮 | `overlay.burst` | 无（点按钮才播一发） | 关（不配置就没有按钮） |

全部由 `wallpaper.config.json` 的 `overlay` 段控制，逐项 `enabled`；全关时 `WallpaperOverlay` 直接返回 `null`，
页面恢复成纯壁纸。唯一的例外是**喷射按钮**：它没有 `enabled`，配了就有按钮、没配就没有，
抽屉里也没有它的 tab（见下文「喷射按钮」）。
改完刷新即生效，也可以直接在壁纸页的**设置抽屉**里调（控件各占一个 tab，实时预览），
调好点「记录配置」就存进本机。**每个 tab 只露出「显示」这一组开关，勾选后才展开它自己的外观 / 位置 /
响应等子设置**——没开的控件看不见也调不了，摆一堆控件只会让面板变长。**聚光灯没有单独 tab**：它和指针
特效同为「铺满全屏、只吃指针事件」的一层，所以放在「指针」tab 里的第二节，但配置仍是独立的
`overlay.spotlight`，两者可以分开开关；它自己的子设置同样跟着它的开关走。**取景框也没有单独 tab**：
它铺满整个画面、不认 `anchor`（画面级装饰，不包裹任何控件），所以和性能读数 / 清除存储一起放在「其他」tab 里。

```json
"overlay": {
  "accent": "#a8c4ff",
  "clock": { "enabled": true, "placement": "minimal", "anchor": "bottom-left", "offsetX": 4, "offsetY": 4 },
  "spectrum": { "enabled": true, "variant": "bars", "width": "100vw", "height": "14vh", "anchor": "bottom-center" },
  "albumArt": { "enabled": true, "variant": "classic", "anchor": "top-left", "offsetX": 4, "offsetY": 4 },
  "ambient": { "enabled": true, "variant": "sakura", "density": 100 },
  "light": { "enabled": true, "variant": "dusk", "anchor": "top-left", "intensity": 100, "size": 0, "rays": 1, "follow": 0.45, "sway": 16 },
  "pointer": { "enabled": true, "trailVariant": "glow", "clickVariant": "ripple" },
  "spotlight": { "enabled": true, "size": 420, "feather": 0.45, "dim": 0.72, "glow": 0.22, "smoothing": 0.05 },
  "frame": { "enabled": true, "variant": "corners", "inset": 28, "thickness": 1.5, "grid": "thirds", "rec": "dot" }
}
```

几条容易踩的约定：

- **`anchor` + `offsetX` / `offsetY`**：9 个锚点（四角 + 四边中点 + 居中），偏移从锚点**向内**计；数字是视口百分比，
  字符串是任意 CSS 长度（`'100px'`）。`0` 恒等于贴边。**铺满全屏的几层没有这套参数**：
  `ambient` / `pointer` / `spotlight` / `frame` 不认 `anchor`，位置由「铺满视口」决定。
  取景框更彻底：它连 `size` 也没有——`inset`（离画面边的距离）、`thickness`（线宽）、`length`（角臂长）
  是画面像素，统一由 `size` 倍率缩放。
- **光照的 `anchor` 不是「给这一层找位置」**：它放的是**光源中心**（一个点），光束永远背离它射出，
  所以没有第二个角度参数能跟它自相矛盾；偏移沿用同一套符号规则，负数可以把光源推到画面外（画外的窗）。
  `size` 是光池半径（px），配置里写 `0` = 跟随变体预设（每个变体自带 1100–2400 的一档），
  `WallpaperOverlay` 里换成 `undefined` 再传——因为非正半径会让整条 `radial-gradient` 失效，光会整层消失。
  `rays`（多少光走成光束）与 `flare`（镜头光斑倍率）是**分配**而非亮度：`overcast` 没有光束、
  只有 `clear-sky` 有光斑，抽屉里按变体隐藏这两个滑块。整盏灯唯一亮度旋钮是 `intensity`（一次乘光池 / 热点 / 光束）。
  和聚光灯相反，它**第一帧就在**：没有指针输入的壁纸照样有天气，`follow` 只是加分项。
- **取景框四角文字（`labels`）是开关 + 固定文案**：配置里只有 `overlay.frame.labels: true|false`，
  文案是应用层的常量 `FRAME_LABELS`（`WallpaperOverlay.jsx`，现在是 `AUTO / 4K · 60P / F/2.8 / ISO 400`）。
  不做格式化、不计时（所以暂停前后一模一样）；抽屉里只给开关，因为 WE 的壁纸窗口拿不到键盘焦点
  （见 `SliderField` 注释），文本输入框在那边是死控件。WallKit 的 CSS 会把拉丁字母转大写，
  中文不受影响；`rec` 占左上、`timecode` 占右下时，对应角标会自动下移一行。
- **`size` / `width` / `height`**：控件尺寸。频谱与专辑卡还接受 `width` / `height` 精确覆盖盒子。
  **频谱的抽屉面板只给 `width` / `height`**：wallkit 里显式的宽高会完全覆盖 `size` 缩放，两个都写死时
  `size` 是死参数（旧面板正是这个坑），所以尺寸只有两个轴——线性样式 `100vw` / `14vh` 这类「沿边色带」，
  环形样式（ring / ringwave / ripples / aurora）只给一个「直径」，两轴同值 `vh` 以保证正圆。
  `variant` 见上游 README（时钟 10 种、频谱 9 种、专辑卡 11 种）。专辑卡的 `wall` 布局已被上游移除，
  配置里残留会自动回退成 `classic`。
- **聚光灯的 `size` 是屏幕像素直径（80–3000），不是百分比**：它是唯一不随控件缩放的比例项；
  `feather` / `dim` / `glow` / `smoothing` 都是 0–1（`smoothing` 上限 0.5 秒）。
- **`accent`** 是主题色，作用于频谱 / 粒子 / 指针特效；时钟与专辑卡的文字色为空时跟随 `accent`
  （时钟 `color`、专辑卡 `textColor` 可单独覆盖）。聚光灯不读 `accent`，它自带
  `darkColor` / `lightColor`（默认纯黑 / 纯白）。
- **氛围的 `stars` 是唯一不位移的形态**：星点钉在画面上只闪不落，`speed` 只调闪烁频率，
  `density` 100% = 200 颗、封顶 240（库里的全局上限）；固有色 `#e8efff`，深色背景最好看。
  抽屉的形态列表读 `AMBIENT_VARIANTS`、颜色回退读 `ambientPresetColor()`，两者都在 wallkit 里，
  上游再加形态时只需到 `src/lib/i18n.js` 补一条四语言标签。

## 喷射按钮（`overlay.burst`）

右下角工具列**最上面**的礼炮按钮是这幅壁纸唯一**命令式**的浮层：点一下喷一发
`BurstFx`（wallkit 第三种特效层，只接受 `ref.burst(kind, opts)`）。它**没有 `enabled` 开关、
抽屉里也没有设置项**——按钮在不在就是开关，参数写在 `wallpaper.config.json` 的 `overlay.burst` 里，
按壁纸手调：

```json
"overlay": {
  "burst": {
    "kind": "spray",
    "x": 0.97,
    "y": 0.5,
    "angle": -135,
    "size": 100,
    "intensity": 100,
    "speed": 100,
    "count": 0,
    "color": ""
  }
}
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `kind` | `spray` | `confetti` 彩带 / `spray` 喷水 / `yogurt` 酸奶 |
| `x` / `y` | `0.97` / `0.5` | 发射点，**视口比例** 0–1；默认右边缘往内 3%、垂直居中 |
| `angle` | `-135` | **度**，`0` = 正上、负数 = 逆时针。`-135` = 左上 45°；**`-45` 是右上**（wallkit 的弹道用 `cos/sin` 配屏幕 y 向下，符号容易反） |
| `size` | `100` | 百分比（20–300），粒子尺寸 |
| `intensity` | `100` | 百分比（0–300），**喷射力度**不是透明度：决定初速度、射程、水柱何时破碎 |
| `speed` | `100` | 百分比（20–300），运动节奏 |
| `count` | `0` | 每次触发的粒子数（4–400）；`0` = 用形态自带数量 |
| `color` | `""` | `#rgb` / `#rrggbb`；空 = 形态固有色（彩带彩虹 / 水蓝 / 乳白） |

- 没有 `overlay.burst` 键就**没有按钮**，壁纸与之前完全一样；整个 overlay 关掉时也不渲染这一层。
- `"burst": true` 是简写：全部取上表默认值（右中内缩 3%、左上 45° 喷水）。
- 它**不进抽屉、也没有独立文件**：值和其它浮层设置一样来自 `public/wallpaper.config.json`
  （embed 构建会把它一起内联进 `assets/embed-config.js`，不用额外处理）。
- 唯一和别的设置不同的是**「记录配置」不会把它写进快照**（`configPayload` 里剥掉这个键），
  快照里即便残留也会被深合并时忽略掉——文件始终是唯一来源，改文件就生效。
- 暂停时 wallkit 会**丢弃**命令并清空在飞的爆发，所以 WE 暂停中点按钮不会补播。

## Wallpaper Engine 数据桥接

`vite.config.js` 里的 `wallkitWE()` 会把音频 / 媒体 / 暂停三段监听器以 **classic script** 注入 `index.html`
的 `<head>` 最前面（必须早于模块入口，否则会丢首帧）。普通浏览器里这些全局函数不存在，脚本自动跳过——
所以浏览器里**时钟照常走，频谱是平的、专辑卡不渲染**，这是库的规定行为，不会用假数据兜底。

要在 WE 里真的出数据，需要一份 `project.json`——**`npm run build:we` / `deploy:we` 会自动生成**，
内容来自仓库根的 `project.config.js`（`wallkit/project` 的 `defineProject` 保证形状，
`mergeProject` 保留引擎写过的 `workshopid` / `preview` / `version`）。只改文案时不必重新构建：

```bash
npm run project:gen     # 重新生成 WE 工程目录里的 project.json
npm run project:check   # 只报告漂移，不写盘
```

`project.config.js` 里的 `html()` 区块是**属性面板的说明文案**：头像、求点赞订阅、主页与致谢。
引擎把它当 HTML 渲染，且**不会把值推给页面**，所以运行时不用 `useWallpaperProperties()`；
面板链接有域名白名单（Steam / B 站 / YouTube 可点，GitHub 不行），主页用带颜色的 `<a>` 显示、仍要复制到浏览器打开；
只有 `github.com/mikoberry.png` 这类头像图能显示。

- `supportsaudioprocessing` **必须嵌在 `general` 内**，写顶层会被静默忽略（症状：监听器注册成功但回调 0 次）；
  工具已经把它放对位置，不要手写清单把它挪出去。
- `type` 必须是大写 `"Web"`。
- **面板 HTML 只认一小组标签，`style=` 会被整条丢弃**（实测统计本机 250 份已订阅壁纸的
  `project.json`：用 `style` 的 0 份）。能用的标签：`img` / `br` / `h3`–`h6` / `a` / `b` / `center` /
  `p` / `small` / `hr` / `font` / `li` / `ul`；上色只能写 `<font color=#RRGGBB>`。所以
  `div` / `span` / `background-color` / 圆角 / 边框全部无效——想「醒目」只能靠标题层级 + 颜色 + `<hr>` 分隔。
- 暂停由 `useWallpaperPaused()` 分发：时钟停止 tick、频谱 / 粒子 / 指针特效 / 聚光灯 / 光照冻结，
  喷射丢弃新命令并清掉在飞的爆发，取景框的录制点停止闪、时间码停走（计时器在应用层 `useFrameSeconds()`，wallkit 的 `Frame` 不计时）。

## 与构图的边界

- 浮层在 `.wallpaper-overlay` 里（`position: absolute; inset: 0; z-index: 5`），**在 `.wallpaper-design` 之外**，
  锚定的是**视口**：改 `fit` 或缩放设计画布都不会移动 / 放大控件。
- 层级：背景与模型 < 浮层（5）< 构图手柄（6）< 设置抽屉（7）。`AmbientFx` 在浮层内部压在最下面
  （ambient 1 → 光照 2 → 频谱 3 → 指针 / 喷射 4 → 时钟 / 专辑 5 → 聚光灯 6 → 取景框 7），雪从时钟背后穿过，
  光照把画面打亮但不糊住文字，聚光灯的遮罩则把时钟一起压暗，
  取景线在最上面——它是画在画面上的仪表，不该跟着曝光一起变暗。
- 浮层不参与构图计算，也不改变「画面永不响应指针」这条规则：`PointerFx` / `Spotlight` 只是装饰覆盖层，默认关闭。
- WE 桌面壁纸默认不投递鼠标事件：想让指针特效或聚光灯在实机看到，要在 WE 里为该壁纸开启鼠标交互。
  两者收不到事件时都不会兜底——指针特效画布留空，聚光灯遮罩保持全透明（不会把桌面压黑）。
  背景里若已经叠了 WE 自带粒子层，就不要再开 `ambient`。
