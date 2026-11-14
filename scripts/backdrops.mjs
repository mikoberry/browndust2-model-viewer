// Keeps model-library/backdrops/ in sync with the models that actually exist.
//
// The library only carries backdrops for characters you can actually view, so
// disk and git both stay small: a bucket is pulled in when its character gets a
// model, and dropped when the model goes away. Upstream keeps the full pool, so
// nothing here is destructive in the sense of losing source material.
//
//   node scripts/backdrops.mjs ids                 # ids that have a model
//   node scripts/backdrops.mjs add 003501          # copy that bucket from upstream
//   node scripts/backdrops.mjs prune --dry-run     # report unused buckets
//   node scripts/backdrops.mjs prune               # delete them
//
// `add` copies only missing files (never overwrites) and whitelists the bucket
// in .gitignore. `prune` deletes buckets that no model links to and drops their
// whitelist lines. Both are idempotent.
//
// Upstream defaults to the extracted game assets and can be overridden with
// BD2_BACKDROP_SRC.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIBRARY = path.join(ROOT, 'model-library')
const TARGET_DIR = path.join(LIBRARY, 'backdrops')
const GITIGNORE = path.join(ROOT, '.gitignore')
const MISC_BUCKET = '_misc'

const DEFAULT_SRC =
  'F:/live2d/BrownDust2/Brown-Dust-2-Assets-main/assets/ui/skill_cutscene_background'
const SOURCE_DIR = process.env.BD2_BACKDROP_SRC || DEFAULT_SRC

const CHAR_ID = /(\d{6})/
const SKELETON_EXT = /\.(skel|json)$/i
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i
const WHITELIST_LINE = /^!\/model-library\/backdrops\/[^/]+\/$/

const fmt = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`

// Character ids that have at least one skeleton in the library. `backdrops/`
// is skipped so the bucket tree never feeds back into this list.
function collectCharIds(dir = LIBRARY, out = new Set()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'backdrops' || entry.name.startsWith('.')) continue
      collectCharIds(abs, out)
    } else if (SKELETON_EXT.test(entry.name)) {
      const id = entry.name.match(CHAR_ID)?.[1]
      if (id) out.add(id)
    }
  }
  return out
}

function listBuckets() {
  if (!fs.existsSync(TARGET_DIR)) return []
  return fs
    .readdirSync(TARGET_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

function bucketStats(bucket) {
  const dir = path.join(TARGET_DIR, bucket)
  let files = 0
  let bytes = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    files += 1
    bytes += fs.statSync(path.join(dir, entry.name)).size
  }
  return { files, bytes }
}

// Rewrites just the whitelist lines of .gitignore, sorted, keeping the rest of
// the file byte-identical.
function writeWhitelist(ids) {
  const lines = fs.readFileSync(GITIGNORE, 'utf8').split(/\r?\n/)
  const sorted = [...ids].sort().map((id) => `!/model-library/backdrops/${id}/`)
  const out = []
  let emitted = false
  for (const line of lines) {
    if (WHITELIST_LINE.test(line)) continue
    out.push(line)
    if (line === '/model-library/backdrops/*') {
      out.push(...sorted)
      emitted = true
    }
  }
  if (!emitted) out.push('/model-library/backdrops/*', ...sorted)
  fs.writeFileSync(GITIGNORE, out.join('\n'))
}

function readWhitelist() {
  const ids = new Set()
  for (const line of fs.readFileSync(GITIGNORE, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^!\/model-library\/backdrops\/([^/]+)\/$/)
    if (match) ids.add(match[1])
  }
  return ids
}

function add(ids, { dryRun }) {
  if (!ids.length) {
    console.error('用法：node scripts/backdrops.mjs add <6 位角色 ID> [...]')
    process.exit(1)
  }
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`上游背景目录不存在：${SOURCE_DIR}\n可用 BD2_BACKDROP_SRC 指定。`)
    process.exit(1)
  }

  const models = collectCharIds()
  const source = fs.readdirSync(SOURCE_DIR).filter((name) => IMAGE_EXT.test(name))
  const whitelist = readWhitelist()
  const missingModels = []
  let copied = 0
  let bytes = 0

  for (const id of ids) {
    if (!models.has(id)) missingModels.push(id)

    const matches = source.filter((name) => name.match(CHAR_ID)?.[1] === id)
    const destDir = path.join(TARGET_DIR, id)
    let added = 0
    for (const name of matches) {
      const dest = path.join(destDir, name)
      if (fs.existsSync(dest)) continue
      const size = fs.statSync(path.join(SOURCE_DIR, name)).size
      added += 1
      copied += 1
      bytes += size
      if (!dryRun) {
        fs.mkdirSync(destDir, { recursive: true })
        fs.copyFileSync(path.join(SOURCE_DIR, name), dest)
      }
    }
    whitelist.add(id)
    console.log(
      `  ${id}  ${dryRun ? '将复制' : '已复制'} ${String(added).padStart(3)} 张` +
        `（上游共 ${matches.length} 张）`,
    )
  }

  if (!dryRun) writeWhitelist(whitelist)

  console.log(
    `\n${dryRun ? '[dry-run] ' : ''}${copied} 张 / ${fmt(bytes)} -> ${ids.length} 个桶，` +
      `白名单现 ${whitelist.size} 项`,
  )
  if (missingModels.length) {
    console.log(`注意：${missingModels.join(' ')} 在 model-library 里没有模型，背景不会被用到`)
  }
}

function prune({ dryRun }) {
  const models = collectCharIds()
  const whitelist = readWhitelist()
  const unused = listBuckets().filter((bucket) => !models.has(bucket))

  let files = 0
  let bytes = 0
  for (const bucket of unused) {
    const stats = bucketStats(bucket)
    files += stats.files
    bytes += stats.bytes
    console.log(`  - ${bucket.padEnd(10)} ${String(stats.files).padStart(4)} 张  ${fmt(stats.bytes)}`)
  }

  // Keep the whitelist to exactly the ids that have a model.
  const staleIds = [...whitelist].filter((id) => !models.has(id))
  if (!dryRun) {
    for (const bucket of unused) {
      fs.rmSync(path.join(TARGET_DIR, bucket), { recursive: true, force: true })
    }
    writeWhitelist(models)
  }

  console.log(
    `\n${dryRun ? '[dry-run] ' : ''}${dryRun ? '将删除' : '已删除'} ${unused.length} 个桶 / ` +
      `${files} 张 / ${fmt(bytes)}；保留 ${models.size} 个桶`,
  )
  if (staleIds.length) {
    console.log(`白名单移除：${staleIds.sort().join(' ')}`)
  }
}

const [command, ...rest] = process.argv.slice(2)
const dryRun = rest.includes('--dry-run')

if (command === 'ids') {
  console.log([...collectCharIds()].sort().join('\n'))
} else if (command === 'add') {
  add(rest.filter((arg) => !arg.startsWith('--')), { dryRun })
} else if (command === 'prune') {
  prune({ dryRun })
} else {
  console.log(`用法：
  node scripts/backdrops.mjs ids              # 打印有模型的角色 ID
  node scripts/backdrops.mjs add <id> [...]   # 从上游补齐背景并入白名单
  node scripts/backdrops.mjs prune [--dry-run] # 删除无模型的桶并清理白名单

上游目录：${SOURCE_DIR}`)
}
