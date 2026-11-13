# BrownDust 2 Spine 资源调研

> 目的：判断能否用 `F:\live2d\BrownDust2\model-output` 的游戏资源，配合 `D:\code\js\wallkit` 做一个 Spine 网页壁纸。
> 结论：**可行，而且比 anime-model-viewer 更简单**（BD2 角色是单层、无背景层）。下面是实测数据。
> 调研日期：2026-11-13

实际渲染效果：角色立绘 `preview-character.png`（Aquila，`idle`+`_face0`）、互动 CG `preview-interaction.png`（Justia，`Hot_Summer_Dream`）。

## 1. 结论速览

| 问题 | 结论 |
|---|---|
| 数据格式 | Spine **4.1.11** 二进制 `.skel` + 标准 `.atlas`（已解包，无加密） |
| 运行时 | `@esotericsoftware/spine-webgl@4.1.56`（npm，ESM） |
| 解析验证 | `character` + `npc` + `light_novel_talk` 共 **51 个 skel 全部解析通过，0 失败** |
| 渲染验证 | 已用 4.1.56 在无头 Chrome 里实际渲染出完整角色（见 §3.3） |
| 体积 | 全库 2.5G；其中 `character` 37 套角色共 **120MB**，单套中位数 2.8MB |
| 压缩空间 | PNG→WebP(q92) 实测 **3.6MB→0.62MB（-83%）**，全套角色可压到 ~50MB |
| 关键坑 | **只有 `idle` 会得到一张白脸**：必须叠一条 `_faceN` 动画（见 §3.4） |
| 技能特写的背景 | skel 里没有，背景在 `ui/skill_cutscene_background/`，按 char ID + `backN` 配对（覆盖 83/166 套，见 §3.6） |
| 特殊演出 | `special_animation` 是 15 套 1–4 页的**动态插画 spine**（108MB），透明底、无背景（见 §3.7） |

## 2. 资源盘点

`F:\live2d\BrownDust2\model-output\`

| 目录 | 内容 | 数量 | 体积 | 单套特征 | 是否适合做壁纸 |
|---|---|---|---|---|---|
| `spine/character` | 角色立绘（含换装皮肤） | 37 套 / 29 角色 | 120MB | 单页 2048²，443 骨骼，194 slot，`idle`+`motion`+最多 64 条 `_faceN` | ✅ **主选** |
| `spine/npc` | NPC 立绘 | 8 | 18MB | 同角色，动画名同为 `idle`/`motion` | ✅ 可并入同一套加载器 |
| `spine/light_novel_talk` | 剧情对话立绘（带表情系统） | 6 | 27MB | 动画命名不同：`_default_F` / `_feelingN` / `_feelingN_idle` | ⚠️ 需要另一套动画驱动逻辑 |
| `spine/interaction` | 互动 CG（约会场景） | 14 | 466MB | **7–14 页 2048²**，1489 骨骼，800+ region，`mix1_*`/`mix2_*` 分支 | ❌ 单套显存 100MB+ |
| `spine/skill_cutscene` | 技能特写 | 171 套 / 68 角色 | 1.7G | 4–6 页 2048²，1235 骨骼，`cut_A`/`cut_B`/`loop`；**自身透明底、无背景** | ⚠️ 需外挂背景，见 §3.6 |
| `spine/special_animation` | 特殊演出（动态插画） | 15 套 | 108MB | 1–4 页 2048²，232–711 骨骼，`cut_1`…`cut_3`/`loop`；透明底插画，无背景 | 🔸 比 interaction 轻得多 |
| `chibis` | Q 版场景背景层 | 55 目录 / 445 张 | 212MB | **纯 PNG，无 spine**；`_back_N` 多层 1024² 场景底图（砖墙/床铺/海滩） | 🔸 现成的 1024² 场景底图 |
| `ui/skill_cutscene_background` | 技能特写的场景背景 | 580 张 / 84 个 ID | 228MB | 完整场景图（2048² 或 1024²），**覆盖 83/166 套 cutscene** | ✅ 唯一现成的场景背景来源 |

角色立绘的宽高比中位数 **0.50**（例：Blade 595×1119、Olivier 338×1123），即"竖长全身像"，正适合放在屏幕一侧。

## 3. 技术验证

### 3.1 运行时

`@esotericsoftware/spine-webgl` 有 4.1.x 线（最新 4.1.56），提供 ESM + `iife` 两种产物，可直接被 Vite 打包。与之配套的 `@esotericsoftware/spine-core` 同版本。

- anime-model-viewer 里那份 422KB 的 `spine-webgl.js` 是 **3.8.99**，**读不了 4.1.11 的 skel**，不能复用，必须换成 4.1 线。
- 许可：npm 包 license 为 `LicenseRef-LICENSE`（Spine Runtimes License）。个人自用无碍；若要公开发布，需保留许可声明，且用户侧需各自持有 Spine 编辑器授权。这条和 wallkit 文档 §13.3「模型资产不在 MIT 范围内」是同一个问题的两面。

### 3.2 批量解析结果

用 `spine-core@4.1.56` 的 `SkeletonBinary` 离线跑了全部 51 个角色/NPC/对话模型：

- 0 个失败，版本一律 `4.1.11`
- 动画模式分布：`idle,motion` × 39；`idle` × 3；其余 `light_novel_talk` 用 `_default_F`/`_feelingN` 体系
- `_faceN` 表情动画：0–64 条不等（Olivier 62、Palette 64、Blade 0）
- 页面数：全部 1 页（`interaction`/`cutscene` 才会多页）

### 3.3 实际渲染

最小验证页：`AssetManager` 加载 → `SkeletonBinary` 解析 → `SceneRenderer.drawSkeleton`，无头 Chrome（SwiftShader）截图。

- ✅ 角色完整渲染，图层顺序、半透明、旋转 region 都正确
- ✅ `idle` 循环正常
- ⚠️ 相机取景用 `skeleton.getBounds()` 自动适配可用；角色在 atlas 里的实际占用面积占整页 **89%**，所以不要指望靠裁切省多少显存

### 3.4 关键坑：脸部必须叠 `_faceN`

只播 `idle` 时，截图里**脸部是纯白一块**。原因：脸部由独立的 `AttachmentTimeline` 控制，默认/`idle` 状态下五官附件是空的，游戏在运行时用 `_face0`…`_faceN` 另起一条轨道盖上去。

验证后的正确驱动方式：

```js
state.setAnimation(0, 'idle', true)      // 轨道 0：身体
state.setAnimation(1, '_face0', true)    // 轨道 1：表情（会覆盖脸部的 attachment）
```

叠轨之后脸部五官正常。**这条是整个项目最容易踩的坑**，做壁纸时表情切换就是在这条轨道上换 `_faceN`。

### 3.5 第二个坑：`premultipliedAlpha` 必须传 `false`

`drawSkeleton(skeleton, premultipliedAlpha)` 第二个参数，一开始传 `true`，结果是：

- 角色立绘：看着没问题（对不透明区域几乎无差别）
- **interaction CG：整张画被一块大白板盖住**，只剩边缘的水面

BD2 的 atlas 里没有 `pma: true` 标记，即贴图是**非预乘**的，必须 `drawSkeleton(skeleton, false)`，否则半透明叠加区域会被算成接近全白。改成 `false` 后，interaction 场景完整正确（见对话里的泳池 CG）。

因为角色立绘"看起来"是对的，这个 bug 很容易上线后才发现——**两个类型都要用 `false`**。

### 3.6 技能特写：角色是透明底，背景在 `ui/` 里外挂

`spine/skill_cutscene` 的 skel **不包含场景**。单独渲染 `cutscene_char061306`（Dalvi / Tricky_Lover）得到的是深色纯底上的人物+特效，没有任何环境。

它的场景在 `ui/skill_cutscene_background/`，靠 **char ID 命名配对**：

```
spine/skill_cutscene/Dalvi/Tricky_Lover/cutscene_char061306.skel   ← ID 061306
ui/skill_cutscene_background/char061306back1.png  2048²  不透明  ← 分镜 1
ui/skill_cutscene_background/char061306back2.png  2048²  不透明  ← 分镜 2
```

实测把两者叠起来渲染，配对关系是**按序号对应动画**：

| 动画 | 背景 | 实际画面 |
|---|---|---|
| `cut_A` | `back1` | 衣柜前的房间 |
| `cut_B` | `back2` | 床铺特写 |

覆盖情况：166 套 cutscene 里 **83 套（50%）有同名背景**；缺的那一半是老编号（`0001xx` / `0002xx` 这类早期角色）。106 张背景图属于无 cutscene 的 ID 或纯局部层。

**背景图有两种形态，混在同一目录里：**

| 形态 | 命名 | alpha | 说明 |
|---|---|---|---|
| 完整场景 | `char061306back1.png`、`003401 back2.png` | 255 / 平均 125 | 可直接当底图 |
| 局部层 / 遮罩 | `003401 back2-2.png`、`back2-7.png` | 平均 17 / 4.7 | 只有一小块内容，是叠在 `backN` 上的前景或遮罩 |

区分规则：**带 `-N` 后缀的是局部层，无后缀的 `backN` 才是完整场景。** 直接拿 `-N` 当背景会得到一张几乎全透明的废图。

命名本身不统一（`char061306back1.png` / `003401 back1.png` / `000303_back1.png` / `Char061305 back1-1.png` 四种写法混用），解析时要用「6 位数字 ID + `back(\d+)` + 可选 `-(\d+)`」正则，不能靠字符串切分。

### 3.7 `special_animation`：没有背景的整幅动态插画

15 套，108MB，1–4 页。渲染出来是**透明底的一整幅插画**（人物 + 小怪 + 符咒特效），构图和 interaction CG 类似但**没有环境背景**，也不像角色立绘那样可以自由摆位——它是"画好的一整幅画在动"。

动画是 `cut_1` → `cut_2` → `cut_3`（分段演出）+ `loop`（循环）。`illust_special22` 还有 `_meca` 变体（机械版）。

体积上它是最适合当彩蛋的：中位 7MB/套、2 页 2048²，比 interaction 的 30–50MB 轻一个数量级。

### 3.8 `chibis` 也不是角色图，是 Q 版场景的背景层

之前误判成"Q 版角色静态图"，实际看下来：445 张 PNG 里 185 张是 `_back_N`、149 张是 `back1-1` 这类分层后缀，另有 `_bg` / `_blur` / `_smoke` 若干。翻出来是 **1024² 完全不透明的场景底图**（砖墙打光、紫色床铺 + 泰迪熊、海滩），即 Q 版小剧场的背景层，**整个目录没有 skel**。

所以它是第三个可用的现成场景素材源。分辨率只有 1024²，做全屏壁纸会糊，但做「虚化背景」或「暗角底衬」够用。

### 3.9 最终选定的素材：Wilhelmina「Iron_Monarch」（067601）

在 §3.6 的配对规则基础上又补了一条：**背景不一定在 `ui/` 里**。这套的背景（`char067601_back1.png`，2048²，王座厅）藏在 `chibis\Wilhelmina\Iron_Monarch\`，`ui\skill_cutscene_background\` 里一张都没有。同目录下还有 `back1move` / `back2` / `back2move` 三张 1024² 图，`*move` 是同场景的低清版，不要用。

| 项 | 值 |
|---|---|
| 图集 | 2 页 2048²，纹理 33.5MB |
| 骨骼 / slot / region | 534 / 165 / 168 |
| 源体积 | 8.79MB（skel 1.20 + png 7.59），WebP q90 后约 2.84MB |
| 动画 | `cut_A` 3.43s / `cut_B` 3.33s / `loop` 8.00s / `loop_2` 4.00s |
| `loop_2` 包围盒 | `{ x: -988, y: -1551, w: 2326, h: 2002 }` |

**关键发现：四条动画是两条互斥的姿势线。** `cut_B` / `loop_2` 是站姿持剑，`cut_A` / `loop` 是背身弯腰。`loop` 与 `loop_2` 不是长短版本而是两个状态各自的循环，所以不能拿来做"长短交替"。方案只用站姿线，`loop` 降级为可选彩蛋。

副作用：`cut_B` 与 `loop_2` 姿势几乎一致（bounds 差 <1%），点击演出看不出变化，需要靠镜头推近补足。详见 [design-cutscene-wilhelmina.md](design-cutscene-wilhelmina.md)。

## 4. 体积与优化

现状（`character` 全量）：PNG 89MB + skel 30MB + atlas ≈ 120MB，单套 1.6–6.3MB（中位 2.8MB）。

实测压缩（Aquila 那套 2048² 的图集）：

| 方案 | 体积 | 说明 |
|---|---|---|
| 原始 PNG | 3.65MB | |
| WebP lossless | 1.96MB | -46%，无损 |
| **WebP q92** | **0.62MB** | **-83%**，角色立绘上看不出差别 |

做法很简单：图名改成 `.webp` 并把 atlas 首行页面名同步改掉，`AssetManager` 走 `<img>` 加载，浏览器原生支持。

按 q92 推算，**37 套角色全打包约 50MB**（30MB skel + ~15MB webp）。对一个自包含的 WE 工程来说完全可接受，也就是说**不需要做"用户自选少量角色"这种减法**，可以把整个角色库都塞进去，用 WE 属性面板切换。

skel 本身 800KB 左右一套，是因为里面塞了 245 条 attachment 时间线（表情、眨眼、道具）。无法再压，除非用 Spine 编辑器重导出。

## 5. 与 wallkit 的关系

按 wallkit `architecture.md` §2 的三层模型，这个仓库要承担的是：

```
背景层：Spine 舞台（本仓库实现，壁纸的核心）
外壳层：WE 内联脚本 / project.json / 部署脚本（照抄 anime-model-viewer）
控件层：<Clock/> <Spectrum/> <AlbumArt/>（wallkit，git 引用锁 commit）
```

因此本仓库 ≈ anime-model-viewer 的**简化版**：不需要多层合成（BD2 角色没有背景层），不需要 60 个模型的打包流水线，不需要 65KB 的设置抽屉。

如果改用「技能特写 + 场景背景」当作壁纸主体，才需要做两层合成（背景图 + spine 舞台），并且背景是 2048² 正方形、spine 主体是竖长构图，需要按 `cover` 裁切对齐。

选角机制应当走 **WE 用户属性**（`project.json` 的 `combo` + `wallpaperPropertyListener.applyUserProperties`）。这和 anime-model-viewer 的做法不同——它把选择器做在页面里，而 WE 里没有鼠标焦点，页面内的面板点不到（wallkit AGENTS.md 已明确记录这一点）。

## 6. 待定 / 风险

1. **范围**：只做角色立绘（轻，37 套），还是也要 interaction 互动 CG（重，单套 100MB+ 显存）？后者建议直接放弃，或单独出一个重工程。
2. **背景**：角色立绘是透明底的，要背景有三个选择——(a) 程序化生成（渐变 + 光斑 + 噪点，可控且零体积）；(b) 借用 `ui/skill_cutscene_background` 里的完整场景图（84 个场景，2048²，但都是"房间/海滩"这类室内景，风格未必搭）；(c) 改用 `skill_cutscene` 本身当壁纸主体（自带分镜配对，但单套 6 页 2048² = 96MB 显存）。
3. **显存与切换**：单角色 2048² = 16MB VRAM，不算高；但切角色时必须 `dispose` 旧纹理，否则连切十几次会顶到显存上限。这条在实现时要专门处理。
4. **性能实测**：SwiftShader 的帧率没有参考价值，真实功耗要在 WE 里量。443 骨骼 / 194 slot 单角色压力不大，但仍需确认 WE 暂停时能完全停帧（`setPaused` → 跳过 rAF 主体）。
