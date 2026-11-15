// Adopt the Wallpaper Engine project folder you worked on last.
//
// Creating a wallpaper in the WE editor gives you a bare folder (project.json
// with the editor's defaults, maybe an empty index.html). Rather than passing
// `--target` by hand every time, this script looks into the WE "myprojects"
// directory and regenerates project.json from project.config.js with the exact
// same rules as `npm run project:gen`.
//
//   npm run project:latest                        folder touched most recently
//   npm run project:latest -- --list              show the 10 newest, write nothing
//   npm run project:latest -- --dry               name the pick, write nothing
//   npm run project:latest -- --root <dir>        another myprojects root
//   npm run project:latest -- --target <dir>      skip the search entirely
//   npm run project:latest -- --config <file>     another project.config.js
//   npm run project:latest -- --created           rank by creation instead
//
// Ranking is mtime by default: "the folder I last touched" is what resuming
// work needs, and deploying into a folder counts as touching it. The tradeoff
// is that a freshly created, still-empty project can rank below one you
// deployed to a minute ago — pass --created when you just made a new folder
// and haven't put anything in it yet. Filesystems without a birthtime simply
// return 0 for it, which is why birthtime cannot be the only option.
//
// Generation MERGES, never replaces (buildProject), so `workshopid`, `preview`,
// `version` and anything else the editor wrote survive — re-running this on an
// already published folder cannot detach its Workshop item.

import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_CONFIG,
  DEFAULT_TARGET,
  assertSafeTarget,
  buildProject,
  diffProject,
  loadProjectConfig,
  readArg,
  readProjectFile,
  writeProjectFile,
} from './project-manifest.mjs'

const LIST_LIMIT = 10

// Same precedence idea as resolveTarget(): CLI --root > WE_PROJECTS > the parent
// of the default deploy folder. That folder is `<myprojects>/BD2-test`, so its
// dirname is the Steam library's project root — no second hard-coded path.
function resolveRoot(argv) {
  return path.resolve(
    readArg('root', argv) || process.env.WE_PROJECTS || path.dirname(DEFAULT_TARGET),
  )
}

const stamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

async function scan(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const rows = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dir = path.join(root, entry.name)
    const info = await stat(dir)
    rows.push({
      name: entry.name,
      dir,
      created: info.birthtimeMs || info.mtimeMs,
      modified: info.mtimeMs || info.birthtimeMs,
      hasProject: existsSync(path.join(dir, 'project.json')),
      hasEntry: existsSync(path.join(dir, 'index.html')),
    })
  }
  return rows
}

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

async function main() {
  const options = {
    list: process.argv.includes('--list'),
    dry: process.argv.includes('--dry'),
    target: readArg('target'),
    config: readArg('config'),
    byCreated: process.argv.includes('--created') || readArg('sort') === 'created',
  }
  const sortField = options.byCreated ? 'created' : 'modified'
  const sortLabel = options.byCreated ? '创建时间' : '修改时间'
  const root = resolveRoot()
  const explicit = options.target ? path.resolve(options.target) : null

  let pick
  if (explicit) {
    if (!existsSync(explicit)) fail(`目标目录不存在：${explicit}`)
    pick = { name: path.basename(explicit), dir: explicit, created: null, modified: null }
  } else {
    if (!existsSync(root)) {
      fail(
        `找不到 WE 工程根目录：${root}\n` +
          '  用 --root <dir> 或环境变量 WE_PROJECTS 指定（通常形如 .../wallpaper_engine/projects/myprojects）',
      )
    }
    const rows = await scan(root)
    if (!rows.length) fail(`${root} 下没有任何子文件夹`)
    rows.sort((a, b) => b[sortField] - a[sortField])
    if (options.list) {
      console.log(`${root} 下按${sortLabel}最新的 ${Math.min(rows.length, LIST_LIMIT)} 个文件夹：`)
      for (const row of rows.slice(0, LIST_LIMIT)) {
        const mark = row === rows[0] ? '*' : ' '
        const flags = `${row.hasProject ? 'project.json' : '无 project.json'}, ${row.hasEntry ? '有入口' : '无 index.html'}`
        console.log(`${mark} ${stamp(row[sortField])}  ${row.name}  (${flags})`)
      }
      console.log(`\n* = 会被采用的那个（${sortLabel}最新）`)
      return
    }
    pick = rows[0]
    const marks = [pick.hasProject ? '已有 project.json' : '还没有 project.json', pick.hasEntry ? '入口已就位' : '缺 index.html']
    console.log(`采用${sortLabel}最新的文件夹：${pick.name}`)
    console.log(`  ${stamp(pick[sortField])}  ${pick.dir}  (${marks.join('，')})`)
  }

  assertSafeTarget(pick.dir, fail)

  const config = await loadProjectConfig(options.config || DEFAULT_CONFIG)
  const file = path.join(pick.dir, 'project.json')
  const existing = await readProjectFile(file)
  const { generated, merged } = buildProject(config, existing)
  const count = Object.keys(merged.general?.properties || {}).length

  if (options.dry) {
    const { mismatches, extra } = diffProject(generated, existing)
    if (!existing) console.log('将新建 project.json（该文件夹里还没有）')
    else if (!mismatches.length) console.log('project.json 已与配置一致，无需改动')
    else {
      // One property shows up as ~6 paths (index / order / text / type / value);
      // collapse them so the report reads like a list of things to change.
      const changed = new Set()
      for (const item of mismatches) {
        const property = /^general\.properties\.([^.]+)\./.exec(item.path)
        changed.add(property ? `general.properties.${property[1]}` : item.path)
      }
      console.log(`将改写 ${changed.size} 处：`)
      for (const entry of changed) console.log(`  ${entry}`)
    }
    if (extra.length) console.log(`保留未声明的属性：${extra.join(', ')}`)
    console.log(`  （--dry：没有写盘）`)
    return
  }

  await writeProjectFile(file, merged)
  console.log(`${existing ? '已更新' : '已创建'}：${file}`)
  console.log(`  type Web，音频处理已开启，${count} 个属性，入口 ${merged.file}`)
  if (!pick.hasEntry) {
    console.log(`  提示：该目录还没有 ${merged.file}，跑一次 npm run deploy:we -- --target "${pick.dir}" 把 dist/ 放进去`)
  }
  console.log('  在 WE 里重新应用一次壁纸即可看到改动。')
}

main().catch((error) => fail(error?.message || String(error)))
