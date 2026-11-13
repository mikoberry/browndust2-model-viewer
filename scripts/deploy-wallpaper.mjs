// Deploy: sync dist/ into the Wallpaper Engine project directory.
//
// Sync rules (AGENTS.md §7 — the WE dir holds editor-owned files):
//   - files/dirs from dist overwrite same-named entries in the target
//   - nothing in the target is ever deleted (preview.gif, user-tweaked
//     project.json survive)
//   - project.json is only created when missing (repo root version is the seed;
//     WE rewrites it when users edit properties)

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(rootDir, 'dist')
const defaultTarget =
  'F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/wallpaper'
const targetDir = process.env.WE_PROJECT_DIR || defaultTarget

function fail(message) {
  console.error(`[deploy:wallpaper] ${message}`)
  process.exit(1)
}

const distIndex = path.join(distDir, 'index.html')
if (!fs.existsSync(distIndex)) {
  fail(`missing ${distIndex}; run "npm run build" first`)
}

if (path.resolve(targetDir) === rootDir || path.resolve(targetDir) === distDir) {
  fail(`refusing to deploy into the project itself: ${targetDir}`)
}
if (path.resolve(targetDir) === path.parse(path.resolve(targetDir)).root) {
  fail(`refusing to deploy into a drive root: ${targetDir}`)
}

function syncDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isDirectory()) syncDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

syncDir(distDir, targetDir)

const targetProjectJson = path.join(targetDir, 'project.json')
if (!fs.existsSync(targetProjectJson)) {
  fs.copyFileSync(path.join(rootDir, 'project.json'), targetProjectJson)
  console.log('[deploy:wallpaper] created project.json (seed; edit in WE afterwards)')
}

console.log(`[deploy:wallpaper] synced dist -> ${targetDir}`)

// Remind WE to reload if the editor is running.
const result = spawnSync('tasklist', ['/FI', 'IMAGENAME eq wallpaper_engine.exe'], {
  encoding: 'utf8',
})
if (result.status === 0 && result.stdout.includes('wallpaper_engine.exe')) {
  console.log('[deploy:wallpaper] note: Wallpaper Engine is running — re-select the wallpaper to reload')
}
