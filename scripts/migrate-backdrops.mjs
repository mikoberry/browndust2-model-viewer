// Splits the flat shared backdrop folder into per-character buckets:
//
//   model-library/skill_cutscene_background/*.png
//     -> model-library/backdrops/<6-digit character id>/*.png
//     -> model-library/backdrops/_misc/*.png        (no 6-digit id)
//
// Nothing is rewritten or deleted: files are moved as-is, so filenames (which
// are the only thing the scanner uses to link a backdrop to a model) stay
// intact. The move is idempotent — once the source folder is gone this is a
// no-op, and an existing destination file is reported instead of overwritten.
//
//   node scripts/migrate-backdrops.mjs --dry-run   # report only
//   node scripts/migrate-backdrops.mjs             # do it
//   node scripts/migrate-backdrops.mjs --ids       # print ids to whitelist
//
// `--ids` lists the character ids that currently have a model in the library.
// Those are the buckets worth tracking in git; `.gitignore` keeps every other
// bucket local-only, so that list has to be extended when a new character is
// added.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIBRARY = path.join(ROOT, 'model-library')
const SOURCE_DIR = path.join(LIBRARY, 'skill_cutscene_background')
const TARGET_DIR = path.join(LIBRARY, 'backdrops')
const MISC_BUCKET = '_misc'

const CHAR_ID = /(\d{6})/
const SKELETON_EXT = /\.(skel|json)$/i
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i

const dryRun = process.argv.includes('--dry-run')
const idsOnly = process.argv.includes('--ids')

// Character ids that have at least one skeleton in the library. `backdrops/`
// is skipped so the migrated tree never feeds back into this list.
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

function bucketOf(file) {
  return file.match(CHAR_ID)?.[1] ?? MISC_BUCKET
}

if (idsOnly) {
  console.log([...collectCharIds()].sort().join('\n'))
  process.exit(0)
}

if (!fs.existsSync(SOURCE_DIR)) {
  console.log(`已迁移过：${path.relative(ROOT, SOURCE_DIR)} 不存在`)
  process.exit(0)
}

const files = fs
  .readdirSync(SOURCE_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && IMAGE_EXT.test(entry.name))
  .map((entry) => entry.name)

const buckets = new Map()
const moved = []
const conflicts = []

for (const file of files) {
  const bucket = bucketOf(file)
  const destDir = path.join(TARGET_DIR, bucket)
  const dest = path.join(destDir, file)
  if (!buckets.has(bucket)) buckets.set(bucket, { files: 0, bytes: 0 })

  let bytes = 0
  try {
    bytes = fs.statSync(path.join(SOURCE_DIR, file)).size
  } catch {
    continue
  }

  if (fs.existsSync(dest)) {
    conflicts.push(path.relative(LIBRARY, dest))
    continue
  }
  moved.push({ from: path.join(SOURCE_DIR, file), to: dest, bucket, bytes })
  const stats = buckets.get(bucket)
  stats.files += 1
  stats.bytes += bytes
}

if (!dryRun) {
  for (const { from, to } of moved) {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.renameSync(from, to)
  }
}

const tracked = collectCharIds()
const fmt = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`
const total = moved.reduce((sum, item) => sum + item.bytes, 0)
const linked = [...buckets.entries()].filter(([bucket]) => tracked.has(bucket))

console.log(
  `${dryRun ? '[dry-run] ' : ''}${moved.length} 张 / ${fmt(total)} -> ${buckets.size} 个桶` +
    `（其中 ${linked.length} 个桶对应现有模型）`,
)
for (const [bucket, stats] of [...buckets.entries()].sort()) {
  const mark = tracked.has(bucket) ? '*' : ' '
  console.log(`  ${mark} ${bucket.padEnd(10)} ${String(stats.files).padStart(4)} 张  ${fmt(stats.bytes)}`)
}
if (conflicts.length) {
  console.log(`\n${conflicts.length} 个文件目标已存在，未覆盖：`)
  for (const file of conflicts.slice(0, 10)) console.log(`  ${file}`)
}
if (!dryRun && moved.length && fs.readdirSync(SOURCE_DIR).length === 0) {
  try {
    fs.rmdirSync(SOURCE_DIR)
    console.log(`\n已移除空目录 ${path.relative(ROOT, SOURCE_DIR)}`)
  } catch {
    console.log(`\n${path.relative(ROOT, SOURCE_DIR)} 已空，可手动删除`)
  }
}
console.log(`\n入库白名单（*.gitignore 用）：npm run backdrops:ids`)
