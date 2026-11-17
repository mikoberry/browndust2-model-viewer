// Regenerate (or check) project.json in a Wallpaper Engine project folder from
// project.config.js — no Vite build needed, so editing the panel copy is cheap.
//
//   npm run project:gen                        write <target>/project.json
//   npm run project:check                      report drift only, exit 1
//   npm run project:gen -- --prune             also drop undeclared properties
//   npm run project:gen -- --target <dir>      another WE project folder
//   npm run project:gen -- --config <file>     another config file
//
// The engine rewrites project.json itself (version / snapshotformat / workshopid).
// This script MERGES, never replaces: buildProject() keeps the engine-owned keys,
// so regenerating a published wallpaper cannot detach its Workshop item.
// `--check` is the safe gate to run before committing.

import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import {
  DEFAULT_CONFIG,
  assertSafeTarget,
  buildProject,
  detectPreview,
  diffProject,
  loadProjectConfig,
  readProjectFile,
  resolveTarget,
  writeProjectFile,
} from './project-manifest.mjs'

function printUsage() {
  console.log(
    [
      '用法：npm run project:gen -- [选项]',
      '',
      '  --check            只报告差异，不写文件（不一致时退出码 1）',
      '  --prune            同时删除配置里未声明的属性（默认保留）',
      '  --target <dir>     WE 工程目录（默认同 deploy:we，或 WE_PROJECT）',
      '  --config <file>    配置文件路径（默认仓库根 project.config.js）',
      '',
      `当前配置：${DEFAULT_CONFIG}`,
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const options = { check: false, prune: false, config: null, target: null }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--check') options.check = true
    else if (arg === '--prune') options.prune = true
    else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else {
      const eq = /^--(config|target)=(.+)$/.exec(arg)
      const key = eq ? eq[1] : arg === '--config' || arg === '--target' ? arg.slice(2) : null
      if (!key) throw new Error(`未知参数：${arg}`)
      const value = eq ? eq[2] : argv[++i]
      if (!value || value.startsWith('--')) throw new Error(`--${key} 需要一个值`)
      options[key] = value
    }
  }

  return options
}

const formatValue = (value) => {
  if (value === undefined) return '（无）'
  const text = JSON.stringify(value)
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const targetDir = path.resolve(options.target || resolveTarget([]))
  assertSafeTarget(targetDir)
  const targetFile = path.join(targetDir, 'project.json')

  const config = await loadProjectConfig(options.config || DEFAULT_CONFIG)
  const existing = await readProjectFile(targetFile)
  // Same rule as deploy: a preview file that is really in the folder wins over the
  // default name, so regenerating never re-points a `preview.png` project at a gif.
  const { generated, merged } = buildProject(config, existing, {
    prune: options.prune,
    preview: detectPreview(targetDir) || undefined,
  })
  const count = Object.keys(merged.general?.properties || {}).length
  const summary = `${count} 个属性（含 schemecolor），入口 ${merged.file}`

  if (options.check) {
    // Compare against the GENERATED manifest, not the merged one: that keeps
    // "config disagrees with the file" apart from "file holds an extra key".
    const { mismatches, extra } = diffProject(generated, existing)
    const blocking = mismatches.length > 0 || (options.prune && extra.length > 0)

    if (!blocking) {
      console.log(`已同步：${targetFile}`)
      console.log(summary)
      for (const key of extra) console.log(`  · general.properties.${key} 未在配置中声明（保留）`)
      return
    }

    console.log(`与配置不一致：${targetFile}`)
    for (const item of mismatches) {
      console.log(`  改 ${item.path}: ${formatValue(item.actual)} → ${formatValue(item.expected)}`)
    }
    for (const key of extra) {
      console.log(`  删 general.properties.${key}（配置里没有，--prune 才会删）`)
    }
    console.log('\n运行 npm run project:gen 写入。')
    process.exitCode = 1
    return
  }

  await mkdir(targetDir, { recursive: true })
  await writeProjectFile(targetFile, merged)

  const { extra } = diffProject(generated, existing)
  console.log(`${existing ? '已更新' : '已创建'}：${targetFile}`)
  console.log(summary)
  if (extra.length && !options.prune) {
    console.log(`保留未声明的属性：${extra.join(', ')}（要删掉就加 --prune）`)
  }
  console.log('在 WE 里重新应用一次壁纸即可看到改动。')
}

main().catch((error) => {
  console.error(`✗ ${error?.message || error}`)
  process.exitCode = 1
})
