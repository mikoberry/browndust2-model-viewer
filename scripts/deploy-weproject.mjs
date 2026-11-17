// Copies the built wallpaper into a Wallpaper Engine "web" project folder.
//
// The host loads a project through `project.json`, so the build output has to
// sit next to one. Everything here is idempotent: only the files we generate are
// replaced, so a `preview.gif` you dropped in by hand (and any other file the
// host created) survives every re-deploy.
//
// `project.json` is no longer hand-written: `project.config.js` declares the
// Workshop copy and panel blocks, `wallkit/project` produces the engine shape,
// and mergeProject() keeps whatever the engine wrote (version, workshopid).
// Regenerating therefore cannot detach a published Workshop item. Panel copy can
// also be updated without a build: `npm run project:gen`.
//
//   npm run build:we                  # plain build + deploy to the default folder
//   npm run build:we:embed            # file:// self-contained build + deploy
//   WE_PROJECT=D:/somewhere npm run deploy:we    # deploy an existing dist/
//
// Overridable: `--target <dir>` / `--title <name>` (shell-agnostic, works in
// cmd.exe and PowerShell too), or the WE_PROJECT / WE_TITLE env vars.

import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PREVIEW_NAMES,
  PUBLISH_DIR,
  assertSafeTarget,
  buildProject,
  detectPreview,
  loadProjectConfig,
  readArg,
  readProjectFile,
  resolveTarget,
  writeProjectFile,
} from './project-manifest.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

// Build artifacts owned by Vite / this script. Cleared before every copy so a
// removed chunk or model never lingers in the deployed folder.
const MANAGED = ['assets', 'models', 'index.html']

// Default Workshop thumbnail, from `publish/`. That folder is publish-only
// metadata (manifest declaration, titles, config library) — deliberately not
// `public/`, which is runtime assets served at the site root, and deliberately
// not the repo root. Seeded, never forced: a folder that already has a preview
// image keeps it.
const DEFAULT_PREVIEW = path.join(PUBLISH_DIR, 'preview.gif')

// Shipped as a runtime setting but deployed like everything else: the folder is a
// mirror of dist/, so tuning done in the deployed copy is overwritten on the next
// deploy. Tune in the repo (`public/wallpaper.config.json`) or use the drawer's
// "复制配置" to carry a tweak back.
const RUNTIME_ONLY = 'wallpaper.config.json'

const target = resolveTarget()
// No fallback here: `project.config.js` owns the default title. Leaving this
// undefined lets defineProject() use it, while --title / WE_TITLE still win.
const cliTitle = readArg('title') || process.env.WE_TITLE || undefined

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
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
  assertSafeTarget(target, fail)

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

  // Decided BEFORE the copy: once dist/ files are in place, "does this folder
  // already have a thumbnail?" can no longer be answered.
  const hadPreview = detectPreview(target)

  for (const entry of await readdir(DIST)) {
    // Defensive: an older dist/ may still carry a preview.gif copied out of
    // public/ (the default image used to live there). Never clobber a real one.
    if (hadPreview && PREVIEW_NAMES.includes(entry)) continue
    await cp(path.join(DIST, entry), path.join(target, entry), {
      recursive: true,
      force: true,
    })
    copied += 1
  }

  // Seed the default thumbnail after the copy, so it also survives the
  // `deploy:we` (existing dist/) path where nothing about it comes from dist/.
  const seeded = !hadPreview && existsSync(DEFAULT_PREVIEW)
  if (seeded) await cp(DEFAULT_PREVIEW, path.join(target, path.basename(DEFAULT_PREVIEW)))

  const config = await loadProjectConfig()
  // A preview image is named in `project.json`, not auto-discovered by the host:
  // a folder with only the file and no key shows a blank card. So prefer the file
  // that is really here, then fall back to the name declared in
  // project.config.js — that way a fresh project is already pointing at
  // `preview.gif` and dropping the image in later needs no regeneration.
  const detectedPreview = detectPreview(target)
  const previewName = detectedPreview || config.preview || ''

  const projectFile = path.join(target, 'project.json')
  const existing = await readProjectFile(projectFile)
  const { merged: project } = buildProject(config, existing, {
    title: cliTitle,
    preview: previewName,
  })
  await writeProjectFile(projectFile, project)

  const propertyCount = Object.keys(project.general?.properties || {}).length
  const size = await dirSize(target)
  // The default `build:we` deploys real asset files (plain ESM build); the
  // file:// self-contained bundle (`build:we:embed`) adds assets/embed-assets.js.
  // Both are supported; we only report which one landed.
  const embedded = existsSync(path.join(target, 'assets', 'embed-assets.js'))
  console.log(`✓ 已部署到 ${target}`)
  console.log(
    `  入口 index.html，project.json (type: Web, 音频处理已开启, ${propertyCount} 项属性)，覆盖 ${copied} 项`,
  )
  if (embedded) {
    console.log('  file:// 自包含构建：素材与配置已内嵌，运行时不发起任何本地请求')
    console.log(
      '  wallpaper.config.json 仍然复制过去，但嵌入产物不会读它；调参请改仓库里的文件后重新 `npm run build:we:embed`',
    )
  } else {
    console.log('  普通构建：素材是 dist/models/ 下的真实文件，运行时经 fetch/JS 文件加载')
    console.log('  ⚠ 若使用 Wallpaper Engine 2.8.797+（CEF 156，默认禁止 file:// 读本地文件），这份产物会黑屏')
    console.log('    改用 `npm run build:we:embed` 生成自包含版本')
    console.log('  wallpaper.config.json 已随构建覆盖')
  }
  console.log(`  ${size.files} 个文件 / ${mb(size.total)}`)
  if (seeded) {
    console.log(`  缩略图：已放入默认的 ${detectedPreview}（来自 publish/）。换成自己的同名文件即可，之后重新部署不会覆盖`)
  } else if (detectedPreview && detectedPreview !== config.preview) {
    console.log(`  缩略图：使用目录里已有的 ${detectedPreview}`)
  } else if (!detectedPreview) {
    console.log(`  缩略图：project.json 已声明 preview: "${previewName}" —— 放进同名文件即可，不用重新部署`)
  }
  console.log('  在 Wallpaper Engine 里「打开壁纸」→ 该目录，屏幕比例兼容即可直接预览')
}

main().catch((error) => fail(error?.stack || String(error)))
