# 手动导入 WE 工程与手工维护 project.json

> 适用：**不**想用 `deploy:we` 直接往已有工程目录里覆盖，而是走 Wallpaper Engine 编辑器自己的
> 「创建壁纸」导入流程，然后自己管那份 `project.json`。
> 相关：[we-file-access.md](./we-file-access.md)（为什么要 embed 构建）、[wallkit.md](./wallkit.md)（Panel 文案与属性桥）

## 0. 两条路的区别

| | 自动部署（`build:we` / `deploy:we`） | 手动导入（本文） |
|---|---|---|
| 谁创建工程 | 你事先在 WE 里建好，脚本往里复制 | WE 编辑器自己复制 + 生成 `project.json` |
| `project.json` | 脚本用 `project.config.js` 生成并合并 | WE 先写一份空壳，再由你合并或手贴 |
| 适合 | 日常迭代、已经存在的工程 | 新建工程、想自己掌控 manifest |

注意：**手动导入这条路上没有任何一步会自动执行**，构建完、导入完，`project.json` 里只有
`schemecolor` 和一个默认标题，面板文案要自己补（第 3 步）。

## 1. 只构建，不部署

```bash
npm run build:home:embed
```

产物在仓库的 `dist/`：`index.html` + `assets/`（`index-<hash>.js`、`embed-assets.js`、`embed-config.js`）
+ `wallpaper.config.json`。

- **必须带 `--embed`**：Wallpaper Engine 2.8.797+（CEF 156）禁止 `file://` 页面读本地文件，
  普通产物导入后是黑屏。细节见 [we-file-access.md](./we-file-access.md)。
- embed 模式只有 `build:home` 这一条路（全量模型库的 `npm run build` 是非 embed 产物，beta 上不能用）。
- 不要用 `build:we` / `build:we:embed`：那两条都会构建完立刻往 `BD2-test` 复制。

## 2. 在 WE 里导入

1. 打开 Wallpaper Engine 编辑器 →「创建壁纸 / Create Wallpaper」；
2. 把 `D:\code\js\browndust2-model-viewer\dist\index.html` 拖进去；
3. WE 会把整个文件夹**复制**到 `wallpaper_engine\projects\myprojects\<新名字>\`，
   并自己生成一份 `project.json`（只有 `file` / `title` / `type` / `general.properties.schemecolor`）。

拿目录路径的方法：WE 菜单「编辑 → 在资源管理器中打开」。

## 3. 把 title / description / 面板文案写进那份 project.json

### 3.1 推荐：跑生成器合并

```bash
npm run project:gen -- --target "F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/你的新工程名"
```

- **`--target` 必填**：不写就默认写 `BD2-test`。`--target X` 与 `--target=X` 等价。
- 它是**合并**而不是覆盖：`title` / `description` / `general.properties` 用 `project.config.js` 的内容，
  WE 写过的 `preview` / `version` / `snapshotformat` / `workshopid` 等引擎自有字段原样保留，
  文件里多出来、配置没声明的属性也保留（除非加 `--prune`）。
- 只看差异不写盘：

  ```bash
  npm run project:check -- --target "F:/.../你的新工程名"
  ```

  报「已同步」= 一致；报「改 …」= 有漂移，退出码 1。

### 3.2 也可以手工复制 `general`

如果只是想让面板文案过去，可以打开 `BD2-test\project.json`，**只选中 `general` 这一整块（含花括号）**，
覆盖到新工程 `project.json` 里同名的 `general` 上。下面是该文件的完整内容，可直接照抄：

```json
"general": {
  "properties": {
    "schemecolor": {
      "order": 0,
      "text": "ui_browse_properties_scheme_color",
      "type": "color",
      "value": "0 0 0"
    },
    "followBanner": {
      "index": 0,
      "order": 100,
      "text": "<center><h3><b><font color=#FFC83D>⚙️ Click the settings button in the bottom-right corner to customize ⚙️</font></b></h3><h3><b><font color=#FFC83D>⚙️ 点击页面右下角设置按钮可以自定义设置 ⚙️</font></b></h3><hr><img src=\"https://github.com/mikoberry.png?size=140\" width=\"140\" alt=\"mikoberry\" /><h4>✨ 喜欢这款壁纸的话，别忘了点个赞和订阅哦！❤️</h4><h5>👍 🔔</h5><h5>🌟 你的每一个赞、每一次订阅，都是我持续创作、分享更多壁纸的动力！💖</h5><h4>🎀 感谢每一份支持！</h4><h3><a href=\"https://github.com/mikoberry\"><font color=#4DA3FF>github.com/mikoberry</font></a></h3></center><hr><center><h4>✨ If you enjoy this wallpaper, don't forget to Like &amp; Subscribe! ❤️</h4><h5>👍 🔔</h5><h5>🌟 Every like and every subscribe is what keeps me creating and sharing more wallpapers! 💖</h5><h4>🎀 Thank you for every bit of support!</h4></center>",
      "type": "text",
      "value": false
    },
    "sectionAbout": {
      "index": 1,
      "order": 101,
      "text": "<hr><h3>ℹ️ 关于 About</h3>",
      "type": "text",
      "value": false
    },
    "credits": {
      "index": 2,
      "order": 102,
      "text": "二次元角色立绘壁纸，基于 Spine 模型。<br/><h6>非官方同人作品，角色与素材版权归原作所有。Fan-made and unofficial — all character assets belong to their respective owners.</h6>",
      "type": "text",
      "value": false
    }
  },
  "supportsaudioprocessing": true
},
```

以上是 `BD2-test\project.json` 里 `general` 的**完整内容**（2026-11-14 快照，未省略）——**以此文件为准**，
不要按旧文档或截图手敲。复制时连外层花括号一起框选，整块替换掉新工程里同名的 `general`。
面板文案本身还是以仓库的 `project.config.js` 为源；改了文案、`project:gen` 同步过之后，用下面这条命令
重新导出这段快照并替换掉本节的 JSON：

```bash
node -e "const j=require('F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/BD2-test/project.json');console.log(JSON.stringify({general:j.general},null,2).split('\n').slice(1,-1).join('\n'))"
```

`general` 之外还有顶层的 `title` / `description`，见下面 §3.3。

四条铁律：

1. **只替换 `general` 的值，别整份覆盖文件。** 整份粘会冲掉 WE 自己写的 `preview`（缩略图文件名）、
   `version`、`snapshotformat`，以及已发布壁纸的 **`workshopid`**——后者丢了，下次发布会变成新
   Workshop 条目，老订阅者永远收不到更新。
2. **`supportsaudioprocessing` 必须留在 `general` 内部。** 写到顶层会被引擎静默忽略，症状是
   「监听器注册成功但回调 0 次」→ 频谱永远是平的。复制整块 `general` 天然不会错。
3. **改之前把 WE 关掉（至少不要打开该工程）。** 你在「更改工程设置」里动任何东西，WE 会**整份重写**
   `project.json`，手改会被覆盖。
4. **注意 JSON 语法**：`general` 后面要跟逗号（它后面还有 `title` / `type` 等键），字符串里的
   `\"` 转义一个都不能丢，`value: false` 行末尾同理。

### 3.3 顶层的 `title` / `description` 也要一起补

`general` 只管「壁纸属性」面板；Workshop 页面上显示的**标题和简介是顶层的两个兄弟键**，不在 `general` 里，
手动导入后同样要补。下面是 `BD2-test\project.json` 的实际值（2026-11-14 快照，未省略）：

```json

  "description": "《棕色尘埃 2》角色动态壁纸：Spine 立绘 + 对应场景背景，可叠加时钟、音频频谱、专辑卡、氛围粒子与指针特效。\n\nBrownDust 2 live wallpaper: Spine character art over its matching scene, with optional clock, audio spectrum, album card, ambient particles and pointer effects.\n\n",

```

几点：

- `description` 是**一个字符串**，段落之间用 `\n\n` 分隔（不是数组，也不是 `<br>`）。`project.config.js`
  里写成数组只是为了好读，生成时会 join 成这一整串。
- 这里的链接在 Workshop 页面上**可以点击**（该页按 HTML 渲染，和属性面板的限制不同），所以首页 / 源码地址放这里，
  而不是塞进面板文案。
- `title` / `description` 与 `general` 是**同级键**，粘贴时别塞进 `general` 内部；它们在文件里通常排在
  `general` 后面。
- 改完照样跑 §4 的 `JSON.parse` 校验，再跑 `npm run project:check -- --target "<目录>"` 看有没有漏。
- 重新导出这段快照（和 §3.2 一样，改过配置后用它替换上面的 JSON）：

  ```bash
  node -e "const j=require('F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/BD2-test/project.json');console.log(JSON.stringify({title:j.title,description:j.description},null,2))"
  ```

### 3.4 不建议完全手写

面板文案是 HTML 字符串，`index` / `order` / `type` / `value` 四个字段缺一个都可能「界面上看不到但
不报错」。要调文案就改仓库里的 `project.config.js` 再跑第 3.1 步，比手写可靠。

## 4. 校验

语法（最便宜，先跑这个）：

```bash
node -e "JSON.parse(require('fs').readFileSync('F:/.../你的新工程/project.json','utf8'));console.log('JSON OK')"
```

语义（和配置是否一致）：

```bash
npm run project:check -- --target "F:/.../你的新工程名"
```

## 5. 后续更新

| 改了什么 | 要做的 |
|---|---|
| 只改面板文案 / 标题 / 简介 | 改 `project.config.js` → `npm run project:gen -- --target "<目录>"`，**不用重新构建** |
| 改了代码 / 素材 / 配置 | `npm run build:home:embed` → 再复制进 WE 工程（或 `WE_PROJECT="<目录>" npm run deploy:we` 复制现有 `dist/`） |
| 只搬运现有 `dist/` | `WE_PROJECT="<目录>" npm run deploy:we`（不重建） |

`WE_PROJECT` 是 shell 相关的（bash 写 `WE_PROJECT=x npm run …`、cmd 先 `set "WE_PROJECT=x"`、
PowerShell 用 `$env:WE_PROJECT='x';`）；不确定就一律用 `--target`。

## 6. 常见坑

| 坑 | 说明 |
|---|---|
| `dist/` 只有一份 | 谁最后跑谁覆盖。跑过 `build:we`（非 embed）之后 `dist/` 就是普通产物，手动导入会黑屏——导入前重跑 `build:home:embed` |
| embed 下 `wallpaper.config.json` 不生效 | 配置已内联进 `assets/embed-config.js`；调构图 / 换人物要改仓库的 `public/wallpaper.config.json` 再重新构建 |
| WE 缓存 manifest | 改完 `project.json` 要在 WE 里**重新应用一次壁纸**，属性面板才会重新读 |
| 手动导入会整份复制 | 产物约 37MB，导入 / 复制会慢一点；`dist/` 里别临时塞无关文件 |
| 缩略图不会自动出现 | 目标目录里放一张 `preview.gif` / `.jpg` / `.png` 才会被登记 |
| 面板 HTML 只认一小组标签 | 用 `h3`/`h4`/`h5`/`h6`/`a`/`b`/`center`/`p`/`small`/`hr`/`font color=#RRGGBB`/`img`/`li`/`ul`/`br`；**`style=` 会被整条丢弃**，`div` / `span` / 背景色 / 圆角 / 边框都不支持 |
