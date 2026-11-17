# 显示变体（Display Variants）

同一套模型的多套「画面」——BD2 里通常是两个待机循环（`loop` / `loop_2`，偶尔 `loop_3`）
各自配一张背景图。本功能让壁纸可以在这几套之间切换，每一套有独立的背景、构图和入场链。

## 1. 目标

- 抽屉里能切换当前显示哪一套，切换即时生效、不重载模型。
- 每一套可以有自己的背景、两层缩放/偏移、视差、入场序列与逐段构图、循环动画。
- 在 `/spine-viewer` 的「构图」tab 里配置，数量不限（1 套、2 套、3 套都行）。
- 没有配置变体时，行为与改造前**完全一致**。

## 2. 数据形状

配置顶层新增两个键：

```json
{
  "variant": "loop2",
  "variants": [
    { "id": "loop",  "label": "常服", "animation": "loop",   "backdrop": "char021391 back1.png" },
    { "id": "loop2", "label": "礼装", "animation": "loop_2", "backdrop": "char021391 back2.png" }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `variant` | 启动时用哪一套；`''` 或指向不存在的 id = 基础构图 |
| `id` | 必填、在数组内唯一。抽屉 chip 的 `title`、存储/调试都用它 |
| `label` | 可选。字符串，或 `{ "zh": "常服", "en": "Casual" }` 按界面语言取；缺省显示 `id` |
| 其余键 | 同名的配置覆盖，见下表 |

**变体是覆盖集，不是完整文档。** 只写它改动的键，其余回落到基础配置。所以手写时
「同一构图换个循环」只需两行；后台面板产出的则是完整快照（见 §5），可读性换确定性。

### 可覆盖的键（`VARIANT_KEYS`）

`animation` `expression` `animationStart` `backdrop` `backdropTransform` `modelTransform`
`parallax` `sequence` `entrance` `clickAnimation` `zoom` `speed`

合并规则与 `mergeConfig` 一致：对象递归深合并、数组与标量整体替换、`_` 开头的键当注释。
所以变体只写 `entrance.clips.cut_A` 时，其他段仍继承基础值。

**一个嵌套例外：`entrance.autoplay` 是全局键。** 「启动时播放」描述的是「这张壁纸要不要自动放开场」，
不是「这套画面长什么样」——切一套画面就把播放悄悄关掉（或打开）不是任何人想要的。所以：

- `variantOverrides()` 会从任何变体的 `entrance` 里**丢掉** `autoplay`（`GLOBAL_NESTED`），
  手写文件里残留的也当没写，顶层值永远生效；
- 变体的 `entrance.blend` 与逐段构图仍然逐套独立；
- 抽屉与后台面板的开关都只写顶层，后台抽屉里的复选框标注「全部变体共用」。

### 故意不可覆盖

| 键 | 原因 |
| --- | --- |
| `modelId` | 模型就是这张壁纸的身份，换模型走配置文件或 `?model=` |
| `design` / `fit` | 设计画布是所有偏移/缩放的单位；按变体变会静默重解释全部数值 |
| `letterbox` `bleed` `overscan` `overlay` | 宿主 chrome，不是「这一套画面」 |

因此变体换背景时**画布不跟着换**：图片按 `fit` 铺到基础画布上，比例不符会裁边。
`design: null` 时画布 = **基础背景**的原生像素尺寸。

## 3. 运行时（`features/wallpaper`）

```
baseConfig（文件 + 用户快照）
  ├─ variants        = normalizeVariants(baseConfig.variants)
  ├─ configVariantId = resolveVariantId(baseConfig, variants)
  ├─ variantId       = 抽屉覆盖值 ?? configVariantId
  └─ config          = applyVariant(baseConfig, activeVariant)   ← 绘制的唯一来源
```

- `design` 始终由 `baseConfig.backdrop` + `baseConfig.design` 求得，与当前变体无关。
- 切换变体只改 props：模型已加载，`handleLoaded` 不会再触发，所以新增一个 effect 按
  当前 `config.animation` / `config.expression` 重新落到轨道 0 / 面部轨道（名字不存在
  就回落到自动挑选，`''` 表示禁用）。
- 切换后背景由现有的两层堆叠 + `entrance.blend` 渐变过渡，不是硬切。
- **加载幕只 gate 首次**：`clipsReady` 用 `clipsWarmRef` 记住「已经开过场」，之后换变体
  仍会 decode 新图，但不再把全屏加载幕盖回已显示的壁纸上。

## 4. 抽屉（`WallpaperSettings`）

构图 tab 顶部出现一组 chip（配置里有 ≥1 个变体就显示），点击即切换：

```
显示变体        [ 基础 ] [ 常服 ] [ 礼装 ]
```

- **「基础」也算一套画面**：它就是配置顶层的那些字段（`variant: ''` 时画的东西），
  与后台 `/spine-viewer` 里的「基础」chip 是同一份。所以**只要建 1 个变体就有得切**，
  不需要「为了凑两套」再复制一份基础配置；反之若想两套都是显式变体，也可以把基础留作未使用的兜底。

- 不写 localStorage，与滑杆/浮层开关一致：抽屉里的调整都是临时值。
- 「记录配置」把当前变体 id 写进 `variant`，并把**这一套**的可调项（两层 transform、`parallax`、
  `clickAnimation`）写进**该变体**，顶层字段保持基础配置自己的值；
  编辑「基础」时才写顶层。`overlay` 不是变体键（宿主浮层，不属于某套画面），永远写顶层。
  **`entrance.autoplay` 同样永远写顶层**（全局键，见 §2），所以无论当前显示哪一套，
  拨这个开关都是改整张壁纸的行为；`entrance.blend` / `clips` 留在各自那一套里。
  → 这条是硬约束：曾经两者都写，导致记录一次快照就把基础压成了屏幕上那套，重载后两套一模一样。
- **记录后立即生效**（不刷新）：`onRecorded` 把刚写出的文档塞回页面的 `loaded`，之后各 chip 读到的是
  记录后的值；否则抽屉还读着记录前的配置，切走再切回来会看到「刚取消的勾选又勾上了」（实际存储是对的，
  只是内存里的旧值盖住了它）。

## 5. 后台（`/spine-viewer` → 构图 tab）

位置：「固定设计画布预览」下方、「设计画布」上方。理由：它决定下面所有控件编辑的是哪一套。

```
显示变体                          [基础] [常服] [礼装] [+ 新增]
                                        改名 / 设为默认 / 删除
```

- `基础` 是第一个 chip，等同今天的面板；**它也能被设为启动默认**（写成 `variant: ''`），
  所以「默认」这一步是可逆的，不会出现「标了某个变体就再也回不到基础」。
- `+ 新增` 以**当前编辑对象的值**整份拷贝（`id` 自动 `v2`/`v3`，可改名），所以新增出来
  立刻就能看、能调。
- `设为默认` 只改 `variant`（写回文件，决定壁纸启动时用哪一套），不动其余内容；
  当前是默认的那一套在 chip 上带 `★` 前缀，按钮显示为「启动默认」。
- 删除当前变体后回到 `基础`；至少保留 0 个变体也完全合法。
- chip 显示 `label`，缺省回退 `id`；`label` 允许中文。
- 切 chip 时预览同步切到那一套，所以没有额外的「预览哪个变体」开关。

### state 组织

```
compose        当前显示值（面板已有的扁平 shape，UI 字段 on/layer/clip/solo + 配置字段）
baseView       基础配置的配置字段（不含 design，不含 UI 字段）
variants       [{ id, label, view }]，view 为 panel shape
editing        '' = 基础，否则是某个 id
defaultVariant 写回文件用的 `variant`
```

- 控件无需改动：它们读写 `compose`，`onPatch` 按 `editing` 分流到 `baseView` 或该变体。
- 面板产出的变体是**完整快照**（`viewOf(compose)`），不做部分覆盖——避免「改了 A 变体的
  某键却影响 B」的歧义；手写 JSON 仍支持最小覆盖。
- 读文件时用 `applyVariant(raw, variant)` 把覆盖折叠进基础，再转成 panel shape，因此
  手写的最小覆盖也能在面板里正确显示。

### 写回（`复制完整配置`）

`buildConfigText` 输出：`...fileConfig` + 当前视图的配置字段 + `design` + `variant` + `variants`。
其中 `animation` / `expression` 的 sentinel（`__auto__` / `__off__`）转回 `null` / `''`，
`sequence` 文本转回数组，偏移取整，变体里的每个 `view` 也走同一套转换（`variantConfigOf`，
额外剥掉 `entrance.autoplay`——它只存在于顶层）。

面板里的「启动时自动播放」虽然是当前 chip 上的复选框，`updateCompose` 会把它同步写进
`baseView` 与所有变体的 view，所以切 chip 看到的值始终一致、导出也只会有一份。

## 6. 兼容与破坏性

| 场景 | 结果 |
| --- | --- |
| 已部署的三张壁纸（无 `variants`） | 逐字节不变 |
| 旧用户快照 | 深合并后仍是单套，抽屉不出 chip |
| 存储键 | 不变（变体写在配置里，不参与命名空间） |
| `publish/wallpaper.presets.json` | 只加 Ren 的示例，其余人物原样 |
| 未知 `id` | `resolveVariantId` 回退 `''`，不白屏 |
| 坏数据 | `normalizeVariants` 丢弃重复/空 id/非对象项，不抛错 |

已知取舍：

- 切变体会让入场按新序列重播一次（`sequenceKey` 变化）。这是「切过去就是那一套的开场」，
  有意为之。
- 抽屉里切变体不会持久化，刷新回到 `variant` 指定的那一套。
- **差分型兄弟动画不在本期范围**：`cut_B_coat` / `cut_A_water` / `loop_bowl` 这类被
  `clipLayers` 折进 base 的素材仍然不可单独播放。要支持得先给折叠逻辑加解包开关，
  历史上这块踩过两次回归，单独排期。

## 7. 验证

- `src/lib/variants.js` 是纯函数（无 React / DOM / import.meta），可直接在 Node 里 import：
  断言「无 variants 时 `applyVariant` 返回同一对象」「深合并 entrance.clips」「未知 id 回退」
  「normalize 丢弃坏项」。
- 语法：`npx esbuild <file> --loader:.jsx=jsx --outfile=/dev/null`。
- 构建：`npm run build`（普通）与 `BD2_EMBED=1` 各跑一次到临时目录，跑完删除。
