// Build dist/ with ONLY the model the home page shows, instead of the whole
// library. It sets MODEL_ONLY (which the Vite model-library plugin reads) to
// the home page's `modelId`, then runs the normal Vite build. Cross-platform:
// environment variables are set in-process, so there is no shell-specific
// `VAR=value command` syntax to worry about.
//
//   npm run build:home
//
// Equivalent to `MODEL_ONLY="<home modelId>" vite build`; the id is read from
// src/features/wallpaper/config.js so it can never drift from what '/' actually
// renders.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = path.join(ROOT, 'src', 'features', 'wallpaper', 'config.js')

function readHomeModelId() {
  const text = readFileSync(CONFIG, 'utf8')
  const match = /modelId:\s*'([^']+)'/.exec(text)
  if (!match) {
    console.error('✗ 无法从 config.js 读取 modelId')
    process.exit(1)
  }
  return match[1]
}

const modelId = process.env.MODEL_ONLY || readHomeModelId()
console.log(`[build:home] 仅打包模型：${modelId}\n`)

// Call Vite's own CLI entry directly instead of going through npx: the `npx`
// shim resolves to `npx.cmd` on Windows, which spawnSync cannot exec without a
// shell, and a plain `npx` is not on PATH on Unix. The direct entry works
// identically everywhere.
const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const result = spawnSync(process.execPath, [viteBin, 'build'], {
  stdio: 'inherit',
  cwd: ROOT,
  env: { ...process.env, MODEL_ONLY: modelId },
})

process.exit(result.status ?? 1)
