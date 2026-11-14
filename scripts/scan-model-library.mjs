// Scans model-library/ and produces a serializable manifest consumed by the
// Vite plugin (virtual:model-library). Pure Node, no browser or Vite APIs, so
// it can also be run directly with `npm run model:list` for diagnostics.
//
// Layout is free-form and recursive. The current library uses
//   model-library/<character>/<skin>/  -> *.skel / *.atlas / page PNGs
//   model-library/backdrops/<6-digit id>/ -> shared backdrop images (png/webp/jpg)
// A "model" is a skeleton file (.skel binary or .json) paired with an .atlas.
// Atlas pages are read from the atlas page-name lines (BD2 uses separate
// _2.png ... _N.png files instead of one packed sheet).
//
// Backdrops are matched by the 6-digit character id found in both the model
// stem and the backdrop filename, because the shared library mixes four
// naming styles (char067601_back1 / 003401 back2 / 000303_back1 / back 1).
// Directory layout is irrelevant to the match: this walks the whole library
// recursively and only ever looks at filenames, so buckets can be renamed or
// nested freely.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i
const PAGE_LINE = /^[^\s:][^\r\n]*\.(?:png|jpe?g|webp)\s*$/i
const SKEL_EXT = /\.(skel|json)$/i
const CHAR_ID = /(\d{6})/
const BACK_NUMBER = /back[\s_-]*(\d+)/i

export const DEFAULT_LIBRARY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'model-library',
)

function safeStat(file) {
  try {
    return fs.statSync(file)
  } catch {
    return null
  }
}

// Reads the intrinsic pixel size of a PNG / WebP / JPEG header. The wallpaper
// uses the backdrop's native resolution as its fixed design canvas, so the size
// must be known at build time: measuring it in the browser would make the first
// frame depend on image load timing and break the fixed-composition guarantee.
//
// Backdrops are allowed to be .webp (much smaller for the same artwork) and
// .jpg, so this cannot assume PNG. The format is detected from magic bytes
// rather than the extension, so a mislabelled file still measures correctly.
function readImageSize(file) {
  try {
    const fd = fs.openSync(file, 'r')
    const header = Buffer.alloc(64 * 1024)
    const read = fs.readSync(fd, header, 0, header.length, 0)
    fs.closeSync(fd)
    if (read < 24) return null

    const head = header.subarray(0, read)
    if (head[0] === 0x89 && head.subarray(1, 4).toString('ascii') === 'PNG') {
      return readPngSize(head)
    }
    if (head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP') {
      return readWebpSize(head)
    }
    if (head[0] === 0xff && head[1] === 0xd8) {
      // The SOF marker can sit behind a large EXIF block, so scan the file.
      return readJpegSize(file)
    }
    return null
  } catch {
    return null
  }
}

function readPngSize(buf) {
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

// WebP is a RIFF container; the first chunk after 'WEBP' tells us how to read
// the dimensions: extended (VP8X, includes canvas size), lossy (VP8) or
// lossless (VP8L).
function readWebpSize(buf) {
  const chunk = buf.subarray(12, 16).toString('ascii')
  if (chunk === 'VP8X') {
    return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 }
  }
  if (chunk === 'VP8 ') {
    // 3-byte frame tag, then the 0x9d 0x01 0x2a start code, then 14-bit sizes.
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    if (buf[20] !== 0x2f) return null
    const bits = buf.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  return null
}

// Walks the JPEG segment chain until a Start Of Frame marker, which carries the
// real pixel size (SOF0 baseline / SOF2 progressive / the rest of the family).
function readJpegSize(file) {
  const buf = fs.readFileSync(file)
  let offset = 2
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buf[offset + 1]
    // Standalone markers have no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      offset += marker === 0xff ? 1 : 2
      continue
    }
    const length = buf.readUInt16BE(offset + 2)
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return null
}

function prettify(name) {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function posix(relative) {
  return relative.split(path.sep).join('/')
}

// Every path segment is encoded separately so nested directories stay real
// path segments (an encoded slash would be decoded by the browser / Vite).
function urlForSource(source) {
  return `models/${source.split('/').map(encodeURIComponent).join('/')}`
}

function sourceOf(libraryDir, absolute) {
  return posix(path.relative(libraryDir, absolute))
}

function collectDirs(root) {
  const dirs = []
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    dirs.push(dir)
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        stack.push(path.join(dir, entry.name))
      }
    }
  }
  return dirs.sort((a, b) => a.localeCompare(b))
}

function listFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
}

// Returns the page image names declared by an atlas file.
function readAtlasPages(atlasFile) {
  const text = fs.readFileSync(atlasFile, 'utf8')
  const pages = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (PAGE_LINE.test(line)) pages.push(line)
  }
  return pages
}

function looksLikeSkeletonJson(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Boolean(parsed && Array.isArray(parsed.bones) && parsed.skeleton)
  } catch {
    return false
  }
}

// BD2 ships partial masks (*-N, *_N), left/right slices (*_L / *_R) and
// low-res variants (*move) next to the full scene. Only a clean backN is a
// complete backdrop. `back_01` (no digit right after "back") is a full scene.
function classifyBackdrop(file) {
  const base = file.replace(IMAGE_EXT, '')
  const match = base.match(BACK_NUMBER)
  if (!match) return { usable: true, note: '', backTag: '' }
  const after = base.slice(match.index + match[0].length)
  const tag = `${match[0].replace(/[\s_-]+/g, '').toLowerCase()}${after}`
  if (/^[_-]\d+$/.test(after)) {
    return { usable: false, note: '分片层 / 局部图', backTag: tag }
  }
  if (/^[_-][LR]$/i.test(after)) {
    return { usable: false, note: '左右局部层', backTag: tag }
  }
  if (/^move/i.test(after)) {
    return { usable: false, note: '同场景低清版（1024²）', backTag: tag }
  }
  if (/zoomblur|feather|blur/i.test(base)) {
    return { usable: false, note: '特效层', backTag: tag }
  }
  return { usable: true, note: '', backTag: tag }
}

function makeBackdrop(libraryDir, absolute, from) {
  const file = path.basename(absolute)
  const stat = safeStat(absolute)
  const source = sourceOf(libraryDir, absolute)
  const size = readImageSize(absolute)
  return {
    file,
    source,
    url: urlForSource(source),
    bytes: stat?.size ?? 0,
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    label: `${from === '背景库' ? '背景库 · ' : ''}${prettify(file.replace(IMAGE_EXT, ''))}`,
    from,
    ...classifyBackdrop(file),
  }
}

// Index shared backdrops by the 6-digit id in their filename. Atlas page PNGs
// never contain "backN", so they cannot leak into this index.
function buildBackdropIndex(dirs, libraryDir) {
  const index = new Map()
  for (const dir of dirs) {
    for (const file of listFiles(dir)) {
      if (!IMAGE_EXT.test(file)) continue
      const idMatch = file.match(CHAR_ID)
      if (!idMatch || !BACK_NUMBER.test(file)) continue
      const entry = makeBackdrop(libraryDir, path.join(dir, file), '背景库')
      if (!index.has(idMatch[1])) index.set(idMatch[1], [])
      index.get(idMatch[1]).push(entry)
    }
  }
  return index
}

function scanModelDir(libraryDir, dir, backdropIndex, warnings) {
  const files = listFiles(dir)
  const relative = sourceOf(libraryDir, dir)
  const segments = relative.split('/')
  const character = prettify(segments[0] ?? '')
  const skin = prettify(segments[segments.length - 1] ?? '')

  const skeletons = files.filter(
    (f) => SKEL_EXT.test(f) && (!/\.json$/i.test(f) || looksLikeSkeletonJson(path.join(dir, f))),
  )
  const atlases = files.filter((f) => /\.atlas$/i.test(f))
  const images = files.filter((f) => IMAGE_EXT.test(f))
  const models = []

  for (const skeletonFile of skeletons) {
    const stem = skeletonFile.replace(/\.(skel|json)$/i, '')
    const issues = []
    let atlasFile = atlases.find((f) => f.toLowerCase() === `${stem}.atlas`.toLowerCase())
    if (!atlasFile && atlases.length === 1) atlasFile = atlases[0]
    if (!atlasFile) {
      warnings.push(`${relative}/${skeletonFile}: 未找到同名 .atlas，已跳过`)
      continue
    }

    const pages = []
    try {
      for (const page of readAtlasPages(path.join(dir, atlasFile))) {
        const match = files.find((f) => f.toLowerCase() === page.toLowerCase())
        if (!match) {
          issues.push(`图集页缺失：${page}`)
          continue
        }
        const absolute = path.join(dir, match)
        pages.push({
          file: match,
          source: sourceOf(libraryDir, absolute),
          url: urlForSource(sourceOf(libraryDir, absolute)),
          bytes: safeStat(absolute)?.size ?? 0,
        })
      }
    } catch (err) {
      issues.push(`图集解析失败：${err.message}`)
    }
    if (pages.length === 0) issues.push('图集未声明任何页面')

    const used = new Set(pages.map((p) => p.file.toLowerCase()))
    const local = images
      .filter((f) => !used.has(f.toLowerCase()))
      .map((f) => makeBackdrop(libraryDir, path.join(dir, f), '皮肤目录'))

    const charId = stem.match(CHAR_ID)?.[1] ?? ''
    const shared = backdropIndex.get(charId) ?? []
    // Dedupe by source: a local backdrop may also be present in the index.
    const bySource = new Map()
    for (const item of [...local, ...shared]) bySource.set(item.source, item)
    const backdrops = [...bySource.values()].sort(
      (a, b) =>
        Number(b.usable) - Number(a.usable) ||
        a.from.localeCompare(b.from, 'zh') ||
        a.file.localeCompare(b.file),
    )

    const skeletonAbs = path.join(dir, skeletonFile)
    const atlasAbs = path.join(dir, atlasFile)
    const totalBytes =
      (safeStat(skeletonAbs)?.size ?? 0) +
      (safeStat(atlasAbs)?.size ?? 0) +
      pages.reduce((sum, p) => sum + p.bytes, 0)

    models.push({
      id: `${relative}/${stem}`,
      character,
      skin,
      pathLabel: segments.map(prettify).join(' / '),
      group: relative,
      groupLabel: skin,
      label: prettify(stem),
      charId,
      dir: urlForSource(relative),
      skeleton: {
        file: skeletonFile,
        source: sourceOf(libraryDir, skeletonAbs),
        url: urlForSource(sourceOf(libraryDir, skeletonAbs)),
        kind: /\.json$/i.test(skeletonFile) ? 'json' : 'binary',
        bytes: safeStat(skeletonAbs)?.size ?? 0,
      },
      atlas: {
        file: atlasFile,
        source: sourceOf(libraryDir, atlasAbs),
        url: urlForSource(sourceOf(libraryDir, atlasAbs)),
        bytes: safeStat(atlasAbs)?.size ?? 0,
      },
      pages,
      backdrops,
      totalBytes,
      issues,
    })
  }
  return models
}

/** Scan the library directory. Returns { models, warnings, stats }. */
export function scanModelLibrary(libraryDir = DEFAULT_LIBRARY_DIR) {
  const warnings = []
  if (!fs.existsSync(libraryDir)) {
    return { models: [], warnings: [`model-library 目录不存在：${libraryDir}`], stats: {} }
  }
  const dirs = collectDirs(libraryDir)
  const backdropIndex = buildBackdropIndex(dirs, libraryDir)
  const models = dirs.flatMap((dir) => scanModelDir(libraryDir, dir, backdropIndex, warnings))
  models.sort((a, b) => a.id.localeCompare(b.id))
  return {
    models,
    warnings,
    stats: {
      directories: dirs.length - 1,
      sharedBackdrops: [...backdropIndex.values()].reduce((sum, list) => sum + list.length, 0),
      linkedBackdrops: models.reduce((sum, model) => sum + model.backdrops.length, 0),
    },
  }
}

// CLI: quick inspection without starting Vite.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { models, warnings, stats } = scanModelLibrary()
  const fmt = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`
  console.log(
    `model-library: ${models.length} 个模型 | 背景库候选 ${stats.sharedBackdrops} 张 | 本次关联 ${stats.linkedBackdrops} 张\n`,
  )
  for (const m of models) {
    console.log(`  ${m.pathLabel}  [${m.charId}]`)
    console.log(
      `    ${m.skeleton.kind} ${fmt(m.totalBytes)} | 图集 ${m.pages.length} 页 | 背景 ${m.backdrops.length} 张（可用 ${m.backdrops.filter((b) => b.usable).length}）`,
    )
    if (m.issues.length) console.log(`    问题: ${m.issues.join('; ')}`)
  }
  for (const warning of warnings) console.log(`  ! ${warning}`)
}
