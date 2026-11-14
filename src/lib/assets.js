// Asset URL helper. The Vite plugin serves /models/* from model-library/ in
// dev and emits the same paths into dist/ on build, so only BASE_URL differs.
//
// The `BD2_EMBED=1` build ("file:// self-contained", see docs/we-file-access.md)
// ships every model file as a base64 data URI, because a file:/// URL would be
// blocked instead of fetched by the host's browser. `assetUrl()` therefore
// resolves through the inlined table first; see lib/embed.js. Outside that
// build the table is absent and this module behaves exactly as before.
import { embeddedAsset } from './embed.js'

const BASE = import.meta.env.BASE_URL

export function assetUrl(relativePath) {
  const embedded = embeddedAsset(relativePath)
  if (embedded) return embedded
  return new URL(`${BASE}${relativePath}`, document.baseURI).href
}

// Directory prefix handed to Spine's AssetManager. Directories are never in the
// embed table (it only holds files), so this keeps returning a real URL; the
// per-file data URIs are registered separately in useSpineAsset().
export function modelPrefix(model) {
  return assetUrl(`${model.dir}/`)
}

export { embeddedAsset }

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function formatSeconds(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  return `${seconds.toFixed(2)}s`
}
