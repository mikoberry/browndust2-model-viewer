// Copies the built wallpaper into a Wallpaper Engine "web" project folder.
//
// The host loads a project through `project.json`, so the build output has to
// sit next to one. Everything here is idempotent: only the files we generate are
// replaced, so a `preview.gif` you dropped in by hand (and any other file the
// host created) survives every re-deploy.
//
//   npm run build:we                  # build + deploy to the default folder
//   WE_PROJECT=D:/somewhere npm run deploy:we    # deploy an existing dist/
//
// Overridable: WE_PROJECT (target folder), WE_TITLE (project title).

import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

const DEFAULT_TARGET =
  'F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/BD2-test'

// Build artifacts owned by Vite / this script. Cleared before every copy so a
// removed chunk or model never lingers in the deployed folder.
const MANAGED = ['assets', 'models', 'index.html']

// Shipped as a runtime setting but deployed like everything else: the folder is a
// mirror of dist/, so tuning done in the deployed copy is overwritten on the next
// deploy. Tune in the repo (`public/wallpaper.config.json`) or use the drawer's
// "复制配置" to carry a tweak back.
const RUNTIME_ONLY = 'wallpaper.config.json'

const target = path.resolve(process.env.WE_PROJECT || DEFAULT_TARGET)
const title = process.env.WE_TITLE || 'BrownDust 2'

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

// The script deletes and rewrites directories, so refuse obviously wrong
// targets (drive root, the repo itself, a parent of the repo).
function assertSafeTarget(dir) {
  const segments = dir.split(/[\\/]+/).filter(Boolean)
  if (segments.length < 3) fail(`目标路径太浅，拒绝执行：${dir}`)
  if (dir === ROOT) fail('目标路径就是仓库根目录，拒绝执行')
}

async function dirSize(dir) {
  let total = 0
  let files = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await dirSize(full)
      total += nested.total
      files += nested.files
    } else {
      total += (await stat(full)).size
      files += 1
    }
  }
  return { total, files }
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

async function main() {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    fail('dist/index.html 不存在，先跑 `npm run build`（或用 `npm run build:we`）')
  }
  assertSafeTarget(target)

  await mkdir(target, { recursive: true })

  // Pruning is best-effort. Some environments refuse to delete a ~90 MB tree
  // (sandboxed shells, an antivirus lock, or Wallpaper Engine holding a handle on
  // the running wallpaper). A failed prune only leaves stale hashed chunks behind:
  // the copy below still overwrites every live file and index.html points at the
  // new hashes, so the wallpaper keeps working.
  for (const name of MANAGED) {
    try {
      await rm(path.join(target, name), { recursive: true, force: true })
    } catch (error) {
      console.warn(`! 没能清理 ${name}（${error.code || error.message}），旧文件留在原地`)
    }
  }

  let copied = 0

  for (const entry of await readdir(DIST)) {
    await cp(path.join(DIST, entry), path.join(target, entry), {
      recursive: true,
      force: true,
    })
    copied += 1
  }

  // `preview` is only declared when the file really exists, otherwise the host
  // shows a broken thumbnail.
  const previewName = ['preview.gif', 'preview.jpg', 'preview.png'].find((name) =>
    existsSync(path.join(target, name)),
  )

  const project = {
    file: 'index.html',
    general: {
      properties: {
        schemecolor: {
          order: 0,
          text: 'schemecolor',
          type: 'color',
          value: '0 0 0',
        },
      },
      // The spectrum / album widgets read the host's audio and media bridges;
      // without this flag Wallpaper Engine never publishes the audio frames.
      supportsaudioprocessing: true,
    },
    ...(previewName ? { preview: previewName } : {}),
    snapshotformat: 1,
    snapshotoverlay: '',
    title,
    // Capitalised on purpose: wallkit's WE guide lists `type` as `"Web"`.
    // (Wallpaper Engine's own writer emits lowercase `web`; both load.)
    type: 'Web',
    version: 0,
  }

  await writeFile(
    path.join(target, 'project.json'),
    `${JSON.stringify(project, null, '\t')}\n`,
    'utf8',
  )

  const size = await dirSize(target)
  console.log(`✓ 已部署到 ${target}`)
  console.log(`  入口 index.html，project.json (type: Web, 音频处理已开启)，覆盖 ${copied} 项`)
  console.log('  wallpaper.config.json 已随构建覆盖')
  console.log(`  ${size.files} 个文件 / ${mb(size.total)}`)
  if (!previewName) {
    console.log('  提示：放一张 preview.gif / .jpg / .png 到该目录可作缩略图，重新部署会保留')
  }
  console.log('  在 Wallpaper Engine 里「打开壁纸」→ 该目录，屏幕比例兼容即可直接预览')
}

main().catch((error) => fail(error?.stack || String(error)))
