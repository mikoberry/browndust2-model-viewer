// Which backdrop image belongs to a model. Pure (no DOM / no bundler globals) so
// it can be checked in plain Node, and shared by the wallpaper route and the
// viewer's composition preview — both have to resolve 'auto' identically, or the
// preview would tune a different picture than the one the wallpaper shows.
//
//   'auto'        -> the highest-resolution *usable* backdrop linked to the model
//   'none' / ''   -> no backdrop
//   filename part -> e.g. 'back2' or 'char067601_back1.png'
export function pickBackdrop(model, preference = 'auto') {
  const all = model?.backdrops ?? []
  if (!all.length || preference === 'none' || preference === '') return null

  if (typeof preference === 'string' && preference !== 'auto') {
    const needle = preference.toLowerCase()
    const hit = all.find(
      (item) =>
        item.file.toLowerCase() === needle ||
        item.url.toLowerCase() === needle ||
        item.file.toLowerCase().includes(needle),
    )
    if (hit) return hit
  }

  // Clean full scenes only; prefer the highest native resolution, then a
  // stable filename order so the choice never depends on filesystem order.
  return (
    [...all.filter((item) => item.usable !== false)].sort(
      (a, b) =>
        (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0) ||
        a.file.localeCompare(b.file),
    )[0] ?? null
  )
}
