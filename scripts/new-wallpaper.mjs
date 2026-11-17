// Create a NEW Wallpaper Engine project folder for the model this repo is
// configured to ship, in one command.
//
// `build:we:embed` always deploys into the same folder (`BD2-test` unless
// --target is given), which is right for iterating on an existing wallpaper but
// wrong for publishing a second one. This script keeps the build identical and
// only changes the destination: it derives a folder name from the model id,
// refuses to touch a folder that already holds something, builds the embed
// bundle and writes a fresh project.json with the title you pass.
//
//   npm run we:new                                # title from the local mapping
//   npm run we:new -- --title "…" --save          # record it in the mapping
//   npm run we:new -- --model Luvencia/Ocean_Vanguard --name BD2_Luvencia_Ocean
//   npm run we:new -- --dry                       # print the plan, build nothing
//   npm run we:new -- --list                      # show the local title mapping
//
// Titles are NOT in the repo: `wallpaper.titles.local.json` is gitignored, so
// each machine keeps its own Workshop naming. One entry per model id, resolved
// exact-first then by a unique partial match (a skin path is enough):
//
//   "Luvencia/Ocean_Vanguard/cutscene_char067504": "【自定义】BrownDust2 - …"
//
// A value may also be `{ "title": "…", "dir": "…" }` to pin the folder name.
//
// The model comes from `public/wallpaper.config.json` because that file is the
// single source of truth: it is statically imported by the app, inlined into the
// embed bundle (`assets/embed-config.js`), copied next to index.html and read by
// build-home.mjs to set MODEL_ONLY. Everything a build needs — the model, its
// composition, its localStorage namespace — therefore hangs off that one field,
// so `--model` PATCHES it for the duration of the build and restores the file
// afterwards. Only `modelId` changes: backdrop `auto`, sequence and the rest
// keep whatever the current config says. When several models share a skin, pass
// the full id (`Luvencia/Ocean_Vanguard/cutscene_char067504`).

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { scanModelLibrary } from './scan-model-library.mjs'
import { DEFAULT_TARGET, PUBLISH_DIR, ROOT, assertSafeTarget, readArg } from './project-manifest.mjs'

const SHIPPED_CONFIG = path.join(ROOT, 'public', 'wallpaper.config.json')
const LIBRARY_DIR = path.join(ROOT, 'model-library')
// Local, gitignored: Workshop titles are this machine's publishing metadata, not
// part of the app. Missing file is normal (first run) — see readTitles().
const TITLES_FILE = path.join(PUBLISH_DIR, 'wallpaper.titles.local.json')
// Same idea, but keyed by `<Character>/<Skin>` for the whole skill-cutscene asset
// library (a superset of model-library/). Read as a lower-priority fallback; see
// readTitles(). Also local-only.
const EXTRA_TITLES_FILE = path.join(PUBLISH_DIR, 'wallpaper.titles.skill-cutscene.json')
// Same root the default deploy folder lives in, so there is no second path.
const MYPROJECTS = path.dirname(DEFAULT_TARGET)

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    stdio: 'inherit',
    cwd: ROOT,
    env: process.env,
  })
  if (result.status !== 0) fail(`${script} 失败（退出码 ${result.status}）`)
}

async function readShippedConfig() {
  const text = await readFile(SHIPPED_CONFIG, 'utf8')
  try {
    return { text, config: JSON.parse(text) }
  } catch (error) {
    fail(`public/wallpaper.config.json 不是合法 JSON：${error.message}`)
    return null
  }
}

// Exact id first, then a unique partial match (a skin path such as
// `Luvencia/Ocean_Vanguard`), the same rule the app and the Vite plugin use.
function resolveModel(needle) {
  const { models } = scanModelLibrary(LIBRARY_DIR)
  const exact = models.find((model) => model.id === needle)
  if (exact) return exact
  const partial = models.filter((model) => model.id.includes(needle))
  if (partial.length === 1) return partial[0]
  if (partial.length === 0) {
    fail(
      `model-library 里没有匹配 "${needle}" 的模型。可用 id：\n` +
        models.map((model) => `  ${model.id}`).join('\n'),
    )
  }
  fail(
    `"${needle}" 匹配到多个模型，请写完整 id：\n` +
      partial.map((model) => `  ${model.id}`).join('\n'),
  )
  return null
}

// ---------------------------------------------------------------------------
// Local title mapping (wallpaper.titles.local.json, gitignored)
// ---------------------------------------------------------------------------
// `_`-prefixed keys are comments, like everywhere else in this repo. An entry is
// either a bare title string or `{ title, dir }`; `dir` pins the project folder
// name (a bare name, resolved under myprojects) so it can differ from the
// derived `<Character>_<Skin>`.
async function readJsonFile(file) {
  if (!existsSync(file)) return {}
  const text = await readFile(file, 'utf8')
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (error) {
    fail(`${path.basename(file)} 不是合法 JSON：${error.message}`)
    return {}
  }
}

// Two sources, exact-id file first: `wallpaper.titles.local.json` is keyed by the
// full model id, `wallpaper.titles.skill-cutscene.json` by `<Character>/<Skin>`
// (the whole skill-cutscene asset library, matched as a partial key). The local
// file wins wherever both could apply, because lookupEntry tries exact ids first.
async function readTitles() {
  const extra = await readJsonFile(EXTRA_TITLES_FILE)
  const local = await readJsonFile(TITLES_FILE)
  return { ...extra, ...local }
}

function entriesOf(titles) {
  return Object.entries(titles).filter(([key]) => !key.startsWith('_'))
}

function normalizeEntry(value) {
  if (typeof value === 'string') return { title: value.trim(), dir: '' }
  if (value && typeof value === 'object') {
    return {
      title: typeof value.title === 'string' ? value.title.trim() : '',
      dir: typeof value.dir === 'string' ? value.dir.trim() : '',
    }
  }
  return { title: '', dir: '' }
}

// Exact id first, then a unique partial key (e.g. 'Luvencia/Ocean_Vanguard').
function lookupEntry(titles, modelId) {
  const entries = entriesOf(titles)
  const exact = entries.find(([key]) => key.trim() === modelId)
  const hit = exact ?? (entries.filter(([key]) => modelId.includes(key.trim())).length === 1
    ? entries.filter(([key]) => modelId.includes(key.trim()))[0]
    : null)
  if (!hit) return null
  const { title, dir } = normalizeEntry(hit[1])
  return title ? { key: hit[0], title, dir } : null
}

// Upsert by full model id, keeping `_readme` and any other entries untouched.
// Reads the local file only — the merged view would otherwise copy all 170+
// skill-cutscene entries into it on the first --save.
async function saveTitle(modelId, title, dir) {
  const titles = await readJsonFile(TITLES_FILE)
  const existing = normalizeEntry(titles[modelId])
  titles[modelId] = {
    title,
    ...(dir || existing.dir ? { dir: dir || existing.dir } : {}),
  }
  await writeFile(TITLES_FILE, `${JSON.stringify(titles, null, 2)}\n`, 'utf8')
  console.log(`[we:new] 已记入 ${path.basename(TITLES_FILE)}：${modelId}`)
}

// Filesystem-safe folder name: `Luvencia/Ocean_Vanguard` -> `Luvencia_Ocean_Vanguard`.
const folderNameOf = (model) =>
  `${model.character}_${model.skin}`.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').trim()

async function dirIsEmpty(dir) {
  if (!existsSync(dir)) return true
  const entries = await readdir(dir)
  return entries.length === 0
}

// Write the patched config, run `fn`, then put the original text back no matter
// how we leave. A leftover patched file would silently change what the next
// plain `build` ships, so restore is not optional.
async function withPatchedModel(modelId, fn) {
  const { text, config } = await readShippedConfig()
  if (config.modelId === modelId) return fn()
  const patched = { ...config, modelId }
  const restore = async () => {
    try {
      await writeFile(SHIPPED_CONFIG, text, 'utf8')
    } catch (error) {
      console.error(`✗ 还原 public/wallpaper.config.json 失败，请手动恢复：${error.message}`)
    }
  }
  process.once('SIGINT', () => {
    restore().finally(() => process.exit(130))
  })
  await writeFile(SHIPPED_CONFIG, `${JSON.stringify(patched, null, 2)}\n`, 'utf8')
  console.log(`[we:new] 临时把 modelId 改为 ${modelId}（构建后还原）`)
  try {
    return await fn()
  } finally {
    await restore()
  }
}

async function main() {
  const cliTitle = readArg('title')
  const nameArg = readArg('name')
  const dirArg = readArg('dir')
  const modelArg = readArg('model')
  const dry = process.argv.includes('--dry')
  const force = process.argv.includes('--force')
  const save = process.argv.includes('--save')

  const titles = await readTitles()

  if (process.argv.includes('--list')) {
    const local = entriesOf(await readJsonFile(TITLES_FILE))
    const extra = entriesOf(await readJsonFile(EXTRA_TITLES_FILE))
    console.log(`${path.basename(TITLES_FILE)}（本地、不进 git）：`)
    if (!local.length) console.log('  （空 —— 第一次用 --title 加 --save 记一条）')
    for (const [key, value] of local) {
      const entry = normalizeEntry(value)
      console.log(`  ${key}\n    ${entry.title}${entry.dir ? `  → 目录 ${entry.dir}` : ''}`)
    }
    if (extra.length) {
      console.log(`\n${path.basename(EXTRA_TITLES_FILE)}（${extra.length} 条，按 <角色>/<皮肤> 匹配）：`)
      for (const [key] of extra.slice(0, 5)) console.log(`  ${key}`)
      if (extra.length > 5) console.log(`  …… 其余 ${extra.length - 5} 条见文件`)
    }
    return
  }

  const { config } = await readShippedConfig()
  const model = resolveModel(modelArg && modelArg.trim() ? modelArg.trim() : config.modelId)
  if (model.id !== config.modelId) {
    console.log(
      `[we:new] 注意：当前配置的 modelId 是 ${config.modelId}，本次打包改用 ${model.id}；` +
        '构图 / 序列沿用当前配置（要带专属构图，先把它整块写进 public/wallpaper.config.json）。',
    )
  }

  // Precedence: --title > the local mapping. Nothing is inferred from the model
  // id: a Workshop title is copywriting, and guessing one would publish Chinese
  // text nobody wrote.
  const entry = lookupEntry(titles, model.id)
  const title = (cliTitle && cliTitle.trim()) || entry?.title
  if (!title) {
    fail(
      `没有 ${model.id} 的 Workshop 标题。\n` +
        '  第一次：npm run we:new -- --title "【自定义】…" --save（记进本地 mapping，之后就不用再写）\n' +
        `  或直接编辑 ${path.basename(TITLES_FILE)}；看已有条目：npm run we:new -- --list`,
    )
  }
  const titleSource = cliTitle && cliTitle.trim() ? '命令行 --title' : `本地 mapping（${entry.key}）`

  const pinnedDir = entry?.dir ?? ''
  const rawDir =
    dirArg ||
    (nameArg ? path.join(MYPROJECTS, nameArg) : '') ||
    (pinnedDir ? (path.isAbsolute(pinnedDir) ? pinnedDir : path.join(MYPROJECTS, pinnedDir)) : '') ||
    path.join(MYPROJECTS, folderNameOf(model))
  const dir = path.resolve(rawDir)
  assertSafeTarget(dir, fail)
  if (!force && !(await dirIsEmpty(dir))) {
    fail(
      `目标目录已存在且非空，拒绝覆盖已发布的工程：\n  ${dir}\n` +
        '  换个 --name / --dir，或确认要覆盖时加 --force',
    )
  }

  console.log(`[we:new] 模型：${model.id}`)
  console.log(`[we:new] 标题：${title}  （来源：${titleSource}）`)
  console.log(`[we:new] 目录：${dir}`)
  if (dry) {
    console.log('[we:new] --dry：没有构建，也没有写盘')
    return
  }

  if (save) await saveTitle(model.id, title, nameArg || dirArg || '')

  await withPatchedModel(model.id, () => {
    run('build-home.mjs', ['--embed'])
    if (!existsSync(path.join(ROOT, 'dist', 'assets', 'embed-assets.js'))) {
      fail('dist/ 里没有 assets/embed-assets.js —— 这次不是 embed 产物，CEF 156 下会黑屏')
    }
    run('deploy-weproject.mjs', ['--target', dir, '--title', title])
  })

  console.log('\n下一步：')
  console.log('  1. WE 里「打开壁纸」→ 选上面那个目录（工程已带 project.json）')
  console.log('  2. project.json 已声明 preview（默认 preview.gif）：把图片复制成该目录下的 preview.gif 即可，不用重跑')
  console.log('  3. 只改标题 / 简介：改 project.config.js 后 npm run project:gen -- --target "' + dir + '"')
}

main().catch((error) => fail(error?.stack || String(error)))
