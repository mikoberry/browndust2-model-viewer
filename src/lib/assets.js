// Asset URL helper. The Vite plugin serves /models/* from model-library/ in
// dev and emits the same paths into dist/ on build, so only BASE_URL differs.
const BASE = import.meta.env.BASE_URL

export function assetUrl(relativePath) {
  return new URL(`${BASE}${relativePath}`, document.baseURI).href
}

export function modelPrefix(model) {
  return assetUrl(`${model.dir}/`)
}

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
