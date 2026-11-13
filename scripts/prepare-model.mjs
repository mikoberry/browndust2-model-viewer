// Asset pipeline: repo-local spine files + game background -> public/models/wilhelmina/.
//
// Sources (read-only, never modified):
//   model-library/Iron_Monarch/            skel / atlas / 2 atlas pages (repo-local, primary)
//   F:\live2d\BrownDust2\model-output\...  background PNG (fallback when the repo
//                                          copy does not carry it)
//
// Output (generated, gitignored):
//   public/models/wilhelmina/
//     cutscene_char067601.skel      copied as-is
//     cutscene_char067601.atlas     page filename lines rewritten to .webp
//     cutscene_char067601.webp      atlas page 1 (WebP q90)
//     cutscene_char067601_2.webp    atlas page 2 (WebP q90)
//     back1.webp                    throne-hall background (WebP q90)
//
// Idempotent: safe to run repeatedly.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SOURCE_DIR = path.join(rootDir, 'model-library', 'Iron_Monarch')
const SKELETON = 'cutscene_char067601.skel'
const ATLAS = 'cutscene_char067601.atlas'
const ATLAS_PAGES = ['cutscene_char067601.png', 'cutscene_char067601_2.png']

// The matched background is NOT inside the cutscene directory nor (currently)
// in model-library: it lives in the unpacked game output under chibis/.
// char067601_back1.png is the only 2048x2048, fully opaque scene; the *move
// variants are 1024x1024 low-res duplicates and must not be used.
const GAME_ROOT = 'F:/live2d/BrownDust2/model-output'
const BACKGROUND_CANDIDATES = [
  path.join(rootDir, 'model-library', 'Iron_Monarch', 'bg', 'char067601_back1.png'),
  path.join(GAME_ROOT, 'chibis', 'Wilhelmina', 'Iron_Monarch', 'char067601_back1.png'),
]

const OUTPUT_DIR = path.join(rootDir, 'public', 'models', 'wilhelmina')
const WEBP_QUALITY = 90

function fail(message) {
  console.error(`[prepare:model] ${message}`)
  process.exit(1)
}

function resolveFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    'ffmpeg',
    'E:/Tools/ffmpeg-8.0.1-full_build/bin/ffmpeg.exe',
    'C:/ffmpeg/bin/ffmpeg.exe',
  ].filter(Boolean)
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-version'], { encoding: 'utf8' })
    if (probe.status === 0) return candidate
  }
  return null
}

function toWebp(ffmpeg, source, target) {
  const result = spawnSync(
    ffmpeg,
    ['-y', '-i', source, '-c:v', 'libwebp', '-quality', String(WEBP_QUALITY), target],
    { encoding: 'utf8' },
  )
  if (result.status !== 0 || !fs.existsSync(target)) {
    fail(`WebP conversion failed for ${source}\n${result.stderr}`)
  }
}

// Rewrite only the atlas page filename lines (`.png` -> `.webp`). Bounds and
// offsets must stay byte-identical or every region would misalign.
function rewriteAtlasPageNames(atlasText, pageNames) {
  let text = atlasText
  for (const page of pageNames) {
    const webpName = page.replace(/\.png$/, '.webp')
    // Page names sit on their own line right after the previous page's block.
    // Match them exactly to avoid touching region names that merely contain
    // the page filename as a substring.
    const pattern = new RegExp(`(^|\\n)${page.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\n)`, 'g')
    text = text.replace(pattern, `$1${webpName}`)
  }
  return text
}

function formatBytes(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

// --- validate sources -------------------------------------------------------

for (const file of [SKELETON, ATLAS, ...ATLAS_PAGES]) {
  if (!fs.existsSync(path.join(SOURCE_DIR, file))) {
    fail(`missing source file: ${SOURCE_DIR}/${file}`)
  }
}

const background = BACKGROUND_CANDIDATES.find((candidate) => fs.existsSync(candidate))
if (!background) {
  fail(
    `background not found; looked in:\n  ${BACKGROUND_CANDIDATES.join('\n  ')}\n` +
      'copy char067601_back1.png (2048x2048) into model-library/Iron_Monarch/bg/ or fix GAME_ROOT',
  )
}

const ffmpeg = resolveFfmpeg()
if (!ffmpeg) {
  fail('ffmpeg not found (set FFMPEG_PATH or install ffmpeg on PATH)')
}

// --- generate ---------------------------------------------------------------

fs.rmSync(OUTPUT_DIR, { recursive: true, force: true })
fs.mkdirSync(OUTPUT_DIR, { recursive: true })

const skeletonTarget = path.join(OUTPUT_DIR, SKELETON)
fs.copyFileSync(path.join(SOURCE_DIR, SKELETON), skeletonTarget)

const atlasTarget = path.join(OUTPUT_DIR, ATLAS)
fs.writeFileSync(
  atlasTarget,
  rewriteAtlasPageNames(fs.readFileSync(path.join(SOURCE_DIR, ATLAS), 'utf8'), ATLAS_PAGES),
  'utf8',
)

let totalBytes = fs.statSync(skeletonTarget).size + fs.statSync(atlasTarget).size

for (const page of ATLAS_PAGES) {
  const target = path.join(OUTPUT_DIR, page.replace(/\.png$/, '.webp'))
  toWebp(ffmpeg, path.join(SOURCE_DIR, page), target)
  totalBytes += fs.statSync(target).size
}

const backdropTarget = path.join(OUTPUT_DIR, 'back1.webp')
toWebp(ffmpeg, background, backdropTarget)
totalBytes += fs.statSync(backdropTarget).size

console.log(`[prepare:model] output dir: ${OUTPUT_DIR}`)
for (const entry of fs.readdirSync(OUTPUT_DIR)) {
  console.log(`[prepare:model]   ${entry.padEnd(28)} ${formatBytes(fs.statSync(path.join(OUTPUT_DIR, entry)).size)}`)
}
console.log(`[prepare:model] total: ${formatBytes(totalBytes)}`)
