// Lookups into the file:// build's inlined tables (see docs/we-file-access.md).
//
// `BD2_EMBED=1` (`npm run build:we:embed`) ships every model file as a base64 data URI
// and the factory config as a plain object, because Wallpaper Engine's CEF 156
// blocks every cross-origin request from a file:// page: ES modules,
// `crossorigin` stylesheets, XHR for .skel/.atlas and <img> for atlas pages all
// fail, which shows up as a black wallpaper.
//
// Deliberately free of `import.meta.env` / DOM so plain-Node importers (the
// config-merge assertions in AGENTS §13) can pull it in. In a normal build both
// globals are absent and every function degrades to "nothing embedded".
const ASSETS_GLOBAL = '__BD2_EMBEDDED_ASSETS__'
const CONFIG_GLOBAL = '__BD2_WALLPAPER_CONFIG__'

// Embedded keys are the manifest `source` paths: relative to model-library/,
// unencoded (`backdrops/021201/back 1.png`). Callers pass either that shape
// (Spine does, via `file.source`) or the manifest `url`
// (`models/<encoded path>`), so normalise both — a silent miss would fall back
// to a blocked file:// request and show up only as a timeout.
const MODELS_PREFIX = 'models/'

function embedKey(relativePath) {
  const withoutPrefix = relativePath.startsWith(MODELS_PREFIX)
    ? relativePath.slice(MODELS_PREFIX.length)
    : relativePath
  try {
    return decodeURIComponent(withoutPrefix)
  } catch {
    return withoutPrefix
  }
}

export function embedTable() {
  const table = globalThis[ASSETS_GLOBAL]
  return table && typeof table === 'object' ? table : null
}

// The data URI for one file, or null when this build ships real files.
export function embeddedAsset(relativePath) {
  const table = embedTable()
  if (!table || !relativePath) return null
  return table[embedKey(relativePath)] ?? null
}

// The factory config inlined at build time, or null outside an embed build.
export function injectedConfig() {
  const config = globalThis[CONFIG_GLOBAL]
  return config && typeof config === 'object' ? config : null
}

// True when every file this model needs (skeleton + atlas + all atlas pages)
// is inlined. Backgrounds are excluded on purpose: a missing background leaves
// the model visible, a missing skeleton hangs the load.
export function isPackagedModel(model) {
  const table = embedTable()
  if (!table || !model) return false
  const files = [model.skeleton, model.atlas, ...(model.pages ?? [])]
  return files.length > 0 && files.every((file) => Boolean(file?.source && table[file.source]))
}

// The model this build actually carries, or null in a normal build.
export function packagedModel(models) {
  if (!models?.length) return null
  return models.find((model) => isPackagedModel(model)) ?? null
}
