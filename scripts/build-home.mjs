// Build dist/ with ONLY the model the home page shows, instead of the whole
// library. It sets MODEL_ONLY (which the Vite model-library plugin reads) to
// the home page's `modelId`, then runs the normal Vite build. Cross-platform:
// environment variables are set in-process, so there is no shell-specific
// `VAR=value command` syntax to worry about.
//
//   npm run build:home
//   npm run build:home -- --embed     # also set BD2_EMBED=1 (file:// build)
//
// Equivalent to `MODEL_ONLY="<home modelId>" vite build`. The id comes from
// `public/wallpaper.config.json` FIRST — that file ships inside dist/ and is
// what '/' actually renders — so the packaged model can never drift from the
// shipped configuration. config.js is only the built-in fallback for when the
// JSON cannot be fetched (file:// builds).
//
// `--embed` switches the output to the self-contained file:// build used by
// Wallpaper Engine (classic script + inlined stylesheet + base64 assets). See
// docs/we-file-access.md.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHIPPED_CONFIG = path.join(ROOT, 'public', 'wallpaper.config.json')
const BUILTIN_CONFIG = path.join(ROOT, 'src', 'features', 'wallpaper', 'config.js')

function readHomeModelId() {
  // Factory default (shipped next to index.html, highest priority without a
  // user recording): the model the wallpaper will actually load.
  try {
    const raw = JSON.parse(readFileSync(SHIPPED_CONFIG, 'utf8'))
    if (typeof raw?.modelId === 'string' && raw.modelId.trim()) return raw.modelId
  } catch {
    // Missing / unreadable file: fall through to the built-in default.
  }
  const text = readFileSync(BUILTIN_CONFIG, 'utf8')
  const match = /modelId:\s*'([^']+)'/.exec(text)
  if (!match) {
    console.error('✗ 无法读取 modelId（public/wallpaper.config.json 与 config.js 都失败）')
    process.exit(1)
  }
  return match[1]
}

const modelId = process.env.MODEL_ONLY || readHomeModelId()
const embed = process.argv.includes('--embed')
console.log(`[build:home] 仅打包模型：${modelId}${embed ? '（embed 模式：file:// 自包含）' : ''}\n`)

// Call Vite's own CLI entry directly instead of going through npx: the `npx`
// shim resolves to `npx.cmd` on Windows, which spawnSync cannot exec without a
// shell, and a plain `npx` is not on PATH on Unix. The direct entry works
// identically everywhere.
const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const result = spawnSync(process.execPath, [viteBin, 'build'], {
  stdio: 'inherit',
  cwd: ROOT,
  env: { ...process.env, MODEL_ONLY: modelId, ...(embed ? { BD2_EMBED: '1' } : {}) },
})

process.exit(result.status ?? 1)
