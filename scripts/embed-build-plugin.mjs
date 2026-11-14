// Makes the built wallpaper runnable from `file://`.
//
// Wallpaper Engine 2.8.797 moved to CEF 156 (Chromium 156), which refuses
// cross-origin requests from a `file://` page. Every way this app fetched its
// own files broke at once:
//
//   <script type="module" crossorigin>   -> module scripts always need CORS
//   <link rel="stylesheet" crossorigin>  -> same, `crossorigin` forces CORS
//   XHR for .skel / .atlas               -> file:// XHR is blocked
//   <img> for atlas pages / backdrops    -> file:// images taint / fail
//   fetch('wallpaper.config.json')       -> blocked
//
// So the embed build makes the page request NOTHING:
//
// - generateBundle: every emitted `models/**` asset becomes a base64 data URI
//   inside `assets/embed-assets.js`, and is then removed from the bundle. Keys
//   are the manifest `source` paths (relative to model-library/, unencoded),
//   which is what the runtime looks up. `wallpaper.config.json` is inlined as
//   `assets/embed-config.js`.
// - writeBundle: `dist/index.html` is rewritten so the entry script is a
//   CLASSIC script (no `type="module"`, no `crossorigin`) and the stylesheet is
//   inlined as `<style>`.
//
// The runtime side (src/lib/assets.js + useSpineAsset.js) only activates when
// `self.__BD2_EMBEDDED_ASSETS__` exists, so dev and a plain `npm run build`
// behave exactly as before. Enabled by BD2_EMBED=1 (`npm run build:we:embed`).

import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MODELS_PREFIX = 'models/'
const ASSETS_FILE = 'assets/embed-assets.js'
const CONFIG_FILE = 'assets/embed-config.js'
const CONFIG_SOURCE = 'wallpaper.config.json'
const ASSETS_GLOBAL = '__BD2_EMBEDDED_ASSETS__'
const CONFIG_GLOBAL = '__BD2_WALLPAPER_CONFIG__'

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json;charset=utf-8',
  // Spine's data-URI path decodes text with atob(), i.e. latin1. BD2 atlases are
  // plain ASCII, so this is lossless for them.
  '.atlas': 'text/plain;charset=utf-8',
  '.skel': 'application/octet-stream',
}

const mimeOf = (name) => MIME[path.extname(name).toLowerCase()] ?? 'application/octet-stream'

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function embedBuildPlugin() {
  let root = process.cwd()

  return {
    name: 'bd2:embed-build',
    enforce: 'post',

    configResolved(config) {
      root = config.root
    },

    async generateBundle(_options, bundle) {
      // --- model assets -> data URIs -------------------------------------
      const keys = Object.keys(bundle).filter((key) => key.startsWith(MODELS_PREFIX))
      if (!keys.length) {
        this.warn('[embed] bundle 里没有 models/** 资源，检查 model-library 插件是否先运行')
      }

      const table = {}
      let rawBytes = 0
      for (const key of keys) {
        const entry = bundle[key]
        const buffer = Buffer.isBuffer(entry.source)
          ? entry.source
          : Buffer.from(entry.source)
        // `source` is the unencoded on-disk path, which is exactly the key the
        // runtime uses (`file.source` in the manifest).
        const source = key.slice(MODELS_PREFIX.length)
        table[source] = `data:${mimeOf(source)};base64,${buffer.toString('base64')}`
        rawBytes += buffer.length
        // Dropped from the bundle: the base64 copy above is the only one that
        // ships, so dist/ does not carry the same 27 MB twice.
        delete bundle[key]
      }

      this.emitFile({
        type: 'asset',
        fileName: ASSETS_FILE,
        source: `self.${ASSETS_GLOBAL} = ${JSON.stringify(table)};\n`,
      })

      // --- factory config -> plain object --------------------------------
      const configPath = path.join(root, 'public', CONFIG_SOURCE)
      let configText = ''
      try {
        configText = (await readFile(configPath, 'utf8')).trim()
      } catch (error) {
        this.warn(`[embed] 读不到 ${CONFIG_SOURCE}（${error.message}），配置将回落到内置默认值`)
      }
      this.emitFile({
        type: 'asset',
        fileName: CONFIG_FILE,
        source: configText
          ? `self.${CONFIG_GLOBAL} = ${configText};\n`
          : `self.${CONFIG_GLOBAL} = null;\n`,
      })

      const encoded = keys.reduce((total, key) => total + table[key.slice(MODELS_PREFIX.length)].length, 0)
      console.log(
        `[embed] ${keys.length} 个素材 → ${mb(rawBytes)} → ${ASSETS_FILE} ${mb(encoded)}`,
      )
    },

    async writeBundle(options) {
      const outDir = options.dir ?? path.resolve(root, 'dist')
      const htmlPath = path.join(outDir, 'index.html')
      let html = await readFile(htmlPath, 'utf8')

      // --- inline the stylesheet -----------------------------------------
      // Safety net, and a no-op with the current setup: Rollup only emits a
      // separate .css asset for es/cjs output, so an iife build gets its CSS
      // injected into the JS chunk by Vite (`document.createElement('style')`),
      // leaving no <link> here. Kept because a <link crossorigin> is exactly
      // one of the requests the file:// host blocks — if a future build mode
      // ever emits it again, the build silently stops being file://-safe
      // otherwise.
      const cssLinks = [...html.matchAll(/[ \t]*<link rel="stylesheet" crossorigin href="([^"]+)">\n?/g)]
      for (const [tag, href] of cssLinks) {
        const relative = href.replace(/^\.\//, '')
        let css = ''
        try {
          css = await readFile(path.join(outDir, relative), 'utf8')
        } catch (error) {
          this.warn(`[embed] 读不到 ${relative}（${error.message}），保留外链`)
          continue
        }
        html = html.replace(tag, `    <style>\n${css}\n    </style>\n`)
        await rm(path.join(outDir, relative), { force: true })
      }

      // --- module entry -> classic script --------------------------------
      // An ES module always triggers a CORS fetch. The entry was built with
      // `format: 'iife'` (see vite.config.js), so it also runs as a classic
      // script; `defer` keeps DOM-ready ordering. The embedded tables must
      // execute first, hence they are inserted ahead of the entry.
      const entry = /[ \t]*<script type="module" crossorigin src="([^"]+)"><\/script>/.exec(html)
      if (!entry) {
        this.warn('[embed] index.html 里没有找到 module 入口脚本，可能已经被处理过')
      } else {
        const preloads =
          `    <script defer src="./${ASSETS_FILE}"></script>\n` +
          `    <script defer src="./${CONFIG_FILE}"></script>\n`
        html = html.replace(entry[0], `${preloads}    <script defer src="${entry[1]}"></script>`)
      }

      await writeFile(htmlPath, html, 'utf8')
      console.log('[embed] index.html 改写完成：classic script + 内联样式 + 内嵌素材')
    },
  }
}
