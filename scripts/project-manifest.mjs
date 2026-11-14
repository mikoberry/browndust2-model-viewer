// Shared Wallpaper Engine manifest plumbing for deploy-weproject.mjs and
// gen-project.mjs. `wallkit/project` owns the engine shape; this module owns
// where this repo's config and the deployed project folder live.
//
// Nothing here is imported by the wallpaper itself: it is build/deploy-time only.

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  defineProject,
  mergeProject,
  diffProject,
  stringifyProject,
} from 'wallkit/project'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_CONFIG = path.join(ROOT, 'project.config.js')

export const DEFAULT_TARGET =
  'F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/BD2-test'

// `--name value` and `--name=value` both work, so the scripts behave the same
// in bash, cmd.exe and PowerShell. Unknown flags are left to the caller.
export function readArg(name, argv = process.argv.slice(2)) {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`))
  if (eq) return eq.slice(name.length + 3)
  const at = argv.indexOf(`--${name}`)
  if (at !== -1 && argv[at + 1] && !argv[at + 1].startsWith('--')) return argv[at + 1]
  return undefined
}

// Precedence: CLI --target > WE_PROJECT > default.
export function resolveTarget(argv = process.argv.slice(2)) {
  return path.resolve(readArg('target', argv) || process.env.WE_PROJECT || DEFAULT_TARGET)
}

// Both scripts write outside the repo, so refuse obviously wrong targets
// (drive root, the repo itself, a parent of the repo).
export function assertSafeTarget(dir, fail = (message) => { throw new Error(message) }) {
  const segments = dir.split(/[\\/]+/).filter(Boolean)
  if (segments.length < 3) fail(`目标路径太浅，拒绝执行：${dir}`)
  if (dir === ROOT) fail('目标路径就是仓库根目录，拒绝执行')
}

export async function loadProjectConfig(configPath = DEFAULT_CONFIG) {
  const loaded = await import(pathToFileURL(path.resolve(configPath)).href)
  if (!loaded.default || typeof loaded.default !== 'object') {
    throw new Error(`${configPath} 没有 default export 配置对象`)
  }
  return loaded.default
}

// A missing file is normal (first deploy). A malformed one is not: something
// else wrote it, and silently replacing that would hide a broken project.
export async function readProjectFile(file) {
  if (!existsSync(file)) return null
  const raw = await readFile(file, 'utf8')
  if (raw.trim() === '') return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`${file} 不是合法 JSON，先备份再修：${error.message}`)
  }
}

// `overrides` carries the two values only the deploy script knows: the CLI
// --title and the preview image it just found in the target folder. Leaving
// either out keeps what project.config.js / the editor's copy say.
export function buildProject(config, existing, { prune = false, title, preview } = {}) {
  const generated = defineProject({
    ...config,
    ...(title ? { title } : {}),
    ...(preview ? { preview } : {}),
  })
  return { generated, merged: mergeProject(existing, generated, { prune }) }
}

export function writeProjectFile(file, project) {
  return writeFile(file, stringifyProject(project), 'utf8')
}

export { diffProject, stringifyProject }
