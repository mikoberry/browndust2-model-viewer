// Vite plugin exposing model-library/ as a browsable asset library.
//
// - `virtual:model-library` exports the scanned manifest (models + warnings).
// - In dev, /models/<nested/path>/<file> is served straight from
//   model-library/, so the source assets stay read-only and are never copied
//   into public/. URL path segments mirror the on-disk directory layout
//   (e.g. /models/Wilhelmina/Iron_Monarch/foo.skel).
// - In build, only files referenced by the manifest are emitted into
//   dist/models/ (atlas pages + backdrops linked by character id), so the
//   shared 366MB backdrop library is not copied wholesale.
// - URLs are identical in both modes, so the app has no dev/production
//   branching (it only prefixes import.meta.env.BASE_URL).
// - Adding/removing a file triggers a full reload with a fresh manifest.

import fs from 'node:fs'
import path from 'node:path'
import { scanModelLibrary } from './scan-model-library.mjs'

const VIRTUAL_ID = 'virtual:model-library'
const RESOLVED_ID = `\0${VIRTUAL_ID}`
const URL_PREFIX = '/models/'

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.atlas': 'text/plain; charset=utf-8',
  '.skel': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
}

function modelFiles(model) {
  return [
    model.skeleton,
    model.atlas,
    ...model.pages,
    ...model.backdrops,
  ]
}

function serveLibraryFile(libraryDir, req, res, next) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  if (!pathname.startsWith(URL_PREFIX)) return next()

  const rel = pathname.slice(URL_PREFIX.length)
  const target = path.resolve(libraryDir, rel)
  if (!target.startsWith(libraryDir + path.sep)) return next()

  const stat = fs.statSync(target, { throwIfNoEntry: false })
  if (!stat || !stat.isFile()) return next()

  res.setHeader('Content-Type', MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream')
  res.setHeader('Content-Length', stat.size)
  res.setHeader('Cache-Control', 'no-cache')
  if (req.method === 'HEAD') {
    res.end()
    return undefined
  }
  fs.createReadStream(target).pipe(res)
  return undefined
}

export function modelLibraryPlugin() {
  let libraryDir
  let command

  return {
    name: 'bd2:model-library',
    enforce: 'pre',
    configResolved(config) {
      command = config.command
      libraryDir = path.resolve(config.root, 'model-library')
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      const { models, warnings, stats } = scanModelLibrary(libraryDir)
      return [
        `export const models = ${JSON.stringify(models)};`,
        `export const warnings = ${JSON.stringify(warnings)};`,
        `export const stats = ${JSON.stringify(stats)};`,
        `export const command = ${JSON.stringify(command)};`,
      ].join('\n')
    },
    configureServer(server) {
      // Registered before Vite's internal middlewares so /models/* is not
      // swallowed by the SPA html fallback.
      server.middlewares.use((req, res, next) => {
        try {
          return serveLibraryFile(libraryDir, req, res, next)
        } catch (err) {
          next(err)
          return undefined
        }
      })

      server.watcher.add(libraryDir)
      const onChange = (file) => {
        if (!path.resolve(file).startsWith(libraryDir + path.sep)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)
      server.watcher.on('change', onChange)
    },
    generateBundle() {
      // `MODEL_ONLY=<model id>` limits the emitted assets to ONE model (plus the
      // backdrops linked to it), so a wallpaper release ships just the model the
      // home page shows instead of the whole library. Without it every model is
      // emitted as before. The id is matched the same way the home page resolves
      // it (exact, then partial, then the first model).
      const onlyId = process.env.MODEL_ONLY?.trim()
      const allModels = scanModelLibrary(libraryDir).models
      const targets = onlyId
        ? allModels.filter(
            (m) => m.id === onlyId || m.id.includes(onlyId),
          )
        : allModels
      if (onlyId && targets.length === 0) {
        this.warn(
          `MODEL_ONLY="${onlyId}" 未匹配到任何模型，已回退为打包全部模型。可用 id：\n` +
            allModels.map((m) => `  ${m.id}`).join('\n'),
        )
        targets.push(...allModels)
      }

      const emitted = new Set()
      for (const model of targets) {
        for (const file of modelFiles(model)) {
          if (emitted.has(file.url)) continue
          emitted.add(file.url)
          // `source` is the path relative to model-library/, so it also works
          // for backdrops that live in the shared skill_cutscene_background/.
          const abs = path.resolve(libraryDir, file.source)
          if (!fs.existsSync(abs)) continue
          this.emitFile({
            type: 'asset',
            // URLs encode each path segment (some BD2 backdrop names contain
            // spaces); the emitted filename must be the decoded disk name.
            fileName: decodeURIComponent(file.url),
            source: fs.readFileSync(abs),
          })
        }
      }
    },
  }
}
