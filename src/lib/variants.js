// Display variants: several alternative "looks" for the SAME model, switchable at
// runtime. BD2 hands us this for free — a character scene usually ships two idle
// loops (`loop` / `loop_2`, sometimes `loop_3`) and a backdrop for each, so the
// interesting choice is "which loop + which picture", not "which model".
//
// Shape (top level of wallpaper.config.json):
//
//   "variant": "loop2",                 // which one is active on load ('' = base)
//   "variants": [
//     { "id": "loop",  "label": "常服", "animation": "loop",   "backdrop": "…back1.png" },
//     { "id": "loop2", "label": "礼装", "animation": "loop_2", "backdrop": "…back2.png" }
//   ]
//
// A variant is an OVERRIDE, never a full config: it carries only the keys it
// changes, everything else falls through to the base composition. That keeps the
// file readable, makes a one-line variant possible ("same framing, other loop"),
// and means an old build that knows nothing about variants still renders the
// base correctly.
//
// Deliberately NOT overridable: `modelId` (the model IS the wallpaper), `design`
// / `fit` (the design canvas defines what every offset in the file means — if it
// changed per variant, switching one would silently reinterpret all the numbers),
// and `overlay` / `letterbox` / `overscan` (host chrome, not the picture).
//
// ONE NESTED EXCEPTION (see GLOBAL_NESTED): `entrance.autoplay`. Whether the
// wallpaper plays its cutscene on load is a property of the wallpaper, not of one
// look — a user switching looks must not silently re-enable (or silence) the
// startup playback. So the top-level value always wins and a variant may never
// carry one; `entrance.blend` and the per-clip framing stay per-variant.
//
// Pure module: no React, no DOM, no import.meta — importable from plain Node so
// the merge can be verified without a browser.

export const VARIANT_KEYS = [
  'animation',
  'expression',
  'animationStart',
  'backdrop',
  'backdropTransform',
  'modelTransform',
  'parallax',
  'sequence',
  'entrance',
  'clickAnimation',
  'zoom',
  'speed',
]

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// Keys INSIDE an otherwise per-variant object that are global instead. A
// variant's copy is dropped on read, so a hand-written file that still carries
// one degrades to "ignored" rather than to a second source of truth.
const GLOBAL_NESTED = { entrance: ['autoplay'] }

// `value` without the globally-owned nested keys. Returns `undefined` when
// nothing is left (the whole override can go), `value` itself when it owns none
// of them (so identity is preserved and callers keep their cheap reference
// comparisons).
function withoutGlobalNested(key, value) {
  const blocked = GLOBAL_NESTED[key]
  if (!blocked || !isPlainObject(value)) return value
  let copy = value
  for (const name of blocked) {
    if (name in copy) {
      if (copy === value) copy = { ...value }
      delete copy[name]
    }
  }
  return copy !== value && !Object.keys(copy).length ? undefined : copy
}

// Deep-merge `override` onto `base`, same rules as config.js's mergeConfig: only
// plain objects recurse, arrays / scalars / null replace wholesale, `_`-prefixed
// keys are comments. Kept local (a copy of ~10 lines) instead of importing
// config.js, which imports this module — a cycle would break the pure-Node use.
function mergeDeep(base, override) {
  if (!isPlainObject(override)) return { ...base }
  const merged = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (key.startsWith('_') || value === undefined) continue
    merged[key] = isPlainObject(value) && isPlainObject(merged[key])
      ? mergeDeep(merged[key], value)
      : value
  }
  return merged
}

// Only the whitelisted keys, without `id` / `label` / comments, and without the
// globally-owned nested keys (GLOBAL_NESTED).
export function variantOverrides(variant) {
  const out = {}
  if (!isPlainObject(variant)) return out
  for (const key of VARIANT_KEYS) {
    if (variant[key] === undefined) continue
    const value = withoutGlobalNested(key, variant[key])
    if (value !== undefined) out[key] = value
  }
  return out
}

// The `variants` array as a clean list: every entry has a non-empty unique `id`,
// an optional `label`, and only whitelisted override keys. Anything malformed is
// dropped instead of crashing a wallpaper — a broken variant must never blank
// the page.
export function normalizeVariants(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    if (!isPlainObject(item)) continue
    const id = String(item.id ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, label: item.label, ...variantOverrides(item) })
  }
  return out
}

export function findVariant(variants, id) {
  if (!id) return null
  return (variants ?? []).find((item) => item?.id === id) ?? null
}

// Which variant the config opens on: `config.variant` when it names a variant
// that actually exists, otherwise '' (the base composition).
export function resolveVariantId(config, variants) {
  const id = String(config?.variant ?? '').trim()
  return findVariant(variants, id) ? id : ''
}

// The base config with one variant's overrides applied. Returns `config` itself
// when there is nothing to apply, so identity-based memos stay stable.
export function applyVariant(config, variant) {
  const overrides = variantOverrides(variant)
  if (!Object.keys(overrides).length) return config
  return mergeDeep(config, overrides)
}

// Human-readable chip label. `label` may be a plain string or a per-locale
// object ({ zh: '常服', en: 'Casual' }); a missing label falls back to the id.
export function variantLabel(variant, locale = 'zh') {
  const raw = variant?.label
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (isPlainObject(raw)) {
    const text = raw[locale] ?? raw.zh ?? Object.values(raw).find((value) => typeof value === 'string')
    if (typeof text === 'string' && text.trim()) return text.trim()
  }
  return String(variant?.id ?? '')
}
