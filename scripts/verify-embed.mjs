// Offline checks for the file:// build (`BD2_EMBED=1`, i.e. `npm run build:we:embed`).
//
// Wallpaper Engine 2.8.797 (CEF 156) blocks every cross-origin request from a
// file:// page, so the built wallpaper must request nothing. This script asserts
// that on the artifacts alone — no browser, no dev server:
//
//   node scripts/verify-embed.mjs
//
// Anything that would reintroduce a blocked request (a module script, a
// `crossorigin` attribute, an external stylesheet, a stray file:// asset URL)
// fails the run.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

let failures = 0

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`)
    return
  }
  failures += 1
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
}

const dataPairs = (source) =>
  [...source.matchAll(/"([^"]+)":\s*"data:([^"]+?);base64,([A-Za-z0-9+/=]+)"/g)].map(
    ([, key, mime, base64]) => ({ key, mime, base64 }),
  )

async function main() {
  const htmlPath = path.join(DIST, 'index.html')
  const assetsPath = path.join(DIST, 'assets', 'embed-assets.js')
  const configPath = path.join(DIST, 'assets', 'embed-config.js')

  if (!existsSync(htmlPath) || !existsSync(assetsPath)) {
    console.error('✗ dist/index.html 或 dist/assets/embed-assets.js 不存在，先跑 `npm run build:we:embed`')
    process.exit(1)
  }

  const html = await readFile(htmlPath, 'utf8')
  const assets = await readFile(assetsPath, 'utf8')
  const config = await readFile(configPath, 'utf8')

  console.log('\n[index.html] 不产生跨源请求所需的条件')
  check('无 type="module"（module 脚本强制 CORS）', !html.includes('type="module"'))
  check('无 crossorigin 属性', !html.includes('crossorigin'))
  check('无外链 stylesheet', !/<link[^>]+stylesheet/.test(html))

  // Rollup only emits a separate .css asset for es/cjs output; for iife Vite
  // injects the stylesheet into the JS chunk (document.createElement('style')),
  // which is another zero-request path. Assert that, since there is no <style>
  // tag to look for.
  const entryHref = /<script defer src="\.\/(assets\/index-[^"]+\.js)"><\/script>/.exec(html)
  let entry = ''
  if (entryHref) {
    entry = await readFile(path.join(DIST, entryHref[1]), 'utf8')
  }
  check('入口脚本存在且为经典 script', Boolean(entry))
  check(
    'CSS 已随 JS 注入（无外链样式）',
    entry.includes('createElement("style")') && entry.includes('.wallpaper-design'),
  )

  const order = ['embed-assets.js', 'embed-config.js', 'index-'].map((needle) => {
    const index = html.indexOf(needle)
    return { needle, index }
  })
  check('三个 defer 脚本都存在', order.every((item) => item.index >= 0))
  check(
    '执行顺序：素材 → 配置 → 主脚本',
    order[0].index < order[1].index && order[1].index < order[2].index,
    order.map((item) => `${item.needle}@${item.index}`).join(' < '),
  )
  check('主脚本不用 defer 以外的异步属性', !/index-[^"]+\.js"[^>]*async/.test(html))

  console.log('\n[embed-assets.js] 素材是否完整内嵌')
  const pairs = dataPairs(assets)
  check('解析到素材条目', pairs.length >= 10, `实际 ${pairs.length}`)
  check('含骨架二进制 .skel', pairs.some((item) => item.key.endsWith('.skel') && item.base64.length > 1000))
  check('含图集文本 .atlas', pairs.some((item) => item.key.endsWith('.atlas') && item.base64.length > 100))
  check(
    '含图集页 / 背景 PNG',
    pairs.filter((item) => item.key.endsWith('.png')).length >= 5,
    `实际 ${pairs.filter((item) => item.key.endsWith('.png')).length}`,
  )
  check('含 backdrops/ 路径', pairs.some((item) => item.key.startsWith('backdrops/')))

  const badMime = pairs.filter((item) => {
    if (item.key.endsWith('.png')) return item.mime !== 'image/png'
    if (item.key.endsWith('.skel')) return item.mime !== 'application/octet-stream'
    if (item.key.endsWith('.atlas')) return !item.mime.startsWith('text/plain')
    return true
  })
  check('MIME 与扩展名匹配', badMime.length === 0, badMime.map((item) => item.key).join(', '))

  // Decode only the head of each base64 blob: enough to prove it is a real image
  // without materialising 27 MB.
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const badPng = pairs
    .filter((item) => item.key.endsWith('.png'))
    .filter((item) => !Buffer.from(item.base64.slice(0, 16), 'base64').subarray(0, 8).equals(pngHeader))
  check('PNG 头部魔数正确（base64 没被截断）', badPng.length === 0, badPng.map((item) => item.key).join(', '))

  check('没有输出 dist/models（素材只存一份）', !existsSync(path.join(DIST, 'models')))

  console.log('\n[lib/embed.js] 运行时查表逻辑（与产物是否对得上）')
  // Runtime lookups are what decide whether the browser stays request-free: a
  // key mismatch silently falls back to a blocked file:// URL, which only shows
  // up as a 60s timeout inside Wallpaper Engine. Feed the real module a small
  // synthetic table so both accepted key shapes and the packaged-model guard are
  // exercised here instead of in a browser.
  globalThis.__BD2_EMBEDDED_ASSETS__ = {
    'Tenka_Izumo/Ame-no-Mitori/a.skel': 'data:application/octet-stream;base64,AA==',
    'Tenka_Izumo/Ame-no-Mitori/a.atlas': 'data:text/plain;charset=utf-8;base64,AA==',
    'Tenka_Izumo/Ame-no-Mitori/a.png': 'data:image/png;base64,AA==',
    'backdrops/021201/back 1.png': 'data:image/png;base64,AA==',
  }
  const { embeddedAsset, isPackagedModel, packagedModel } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'lib', 'embed.js')).href
  )

  check(
    'source 形态命中（Spine 传 file.source）',
    embeddedAsset('backdrops/021201/back 1.png') !== null,
  )
  check(
    'url 形态命中（带 models/ 前缀且路径段被 encode）',
    embeddedAsset('models/backdrops/021201/back%201.png') !== null,
  )
  check('未知文件返回 null（回落到普通 URL）', embeddedAsset('models/nope.png') === null)

  const complete = {
    id: 'A',
    skeleton: { source: 'Tenka_Izumo/Ame-no-Mitori/a.skel' },
    atlas: { source: 'Tenka_Izumo/Ame-no-Mitori/a.atlas' },
    pages: [{ source: 'Tenka_Izumo/Ame-no-Mitori/a.png' }],
  }
  const missingPage = {
    id: 'B',
    skeleton: { source: 'Tenka_Izumo/Ame-no-Mitori/a.skel' },
    atlas: { source: 'Tenka_Izumo/Ame-no-Mitori/a.atlas' },
    pages: [{ source: 'Tenka_Izumo/Ame-no-Mitori/missing.png' }],
  }
  check('完整模型判定为已打包', isPackagedModel(complete))
  check('缺图集页的模型判定为未打包', !isPackagedModel(missingPage))
  check(
    '未打包模型能回退到已打包模型（防 60s 超时黑屏）',
    packagedModel([missingPage, complete])?.id === 'A',
  )

  console.log('\n[embed-config.js] 配置是否随构建注入')
  let shippedModelId = ''
  try {
    shippedModelId = JSON.parse(
      await readFile(path.join(ROOT, 'public', 'wallpaper.config.json'), 'utf8'),
    ).modelId
  } catch {
    // asserted below
  }
  check('已注入 __BD2_WALLPAPER_CONFIG__', config.includes('__BD2_WALLPAPER_CONFIG__'))
  check(
    'modelId 与 public/wallpaper.config.json 一致',
    Boolean(shippedModelId) && config.includes(`"modelId": ${JSON.stringify(shippedModelId)}`),
    `期望 ${shippedModelId}`,
  )

  console.log('')
  if (failures) {
    console.error(`✗ ${failures} 项未通过`)
    process.exit(1)
  }
  console.log('✓ file:// 构建自检通过')
}

main().catch((error) => {
  console.error(error?.stack || String(error))
  process.exit(1)
})
