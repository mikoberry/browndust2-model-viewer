// Shared animation defaults for both the wallpaper and the debug viewer.

export const FACE_ANIM = /^_face\d+/i

export function pickDefaultAnimation(list) {
  for (const name of ['loop_2', 'idle', 'loop', '_default_F']) {
    if (list.some((item) => item.name === name)) return name
  }
  return list[0]?.name ?? ''
}

export function pickDefaultExpression(list) {
  return list.find((item) => FACE_ANIM.test(item.name))?.name ?? ''
}

// BD2 entrance cutscenes: a `cut_A` / `cut_B` pair (some models spell it
// `A_cut` / `B_cut`, a few add `C_cut`, some carry a `_water` suffix) that leads
// into the idle loop. Names differ per model, so they are detected here instead
// of being hard-coded per skin.
const CUT_SUFFIX = /(?:^|[^a-z])cut[\s_-]?([a-z])(?=$|[^a-z])/i
const CUT_PREFIX = /(?:^|[^a-z])([a-z])[\s_-]?cut(?=$|[^a-z])/i

// Ordered entrance playlist for one model, or [] when it has no cutscene.
// Pure: takes the animation list from `readAssetInfo()`.
export function pickEntranceSequence(list) {
  const names = (list ?? []).map((item) => item?.name ?? item).filter((name) => typeof name === 'string')
  const cuts = []
  for (const name of names) {
    const hit = CUT_SUFFIX.exec(name) ?? CUT_PREFIX.exec(name)
    if (!hit) continue
    cuts.push({ order: hit[1].toLowerCase(), name })
  }
  if (!cuts.length) return []
  // Letter order first; on a tie the shortest name wins, so a `cut_A_water`
  // variant never hides the plain `cut_A` clip.
  cuts.sort(
    (a, b) =>
      a.order.localeCompare(b.order) || a.name.length - b.name.length || a.name.localeCompare(b.name),
  )

  const sequence = []
  const seen = new Set()
  for (const cut of cuts) {
    if (seen.has(cut.order)) continue
    seen.add(cut.order)
    sequence.push(cut.name)
  }
  // The last clip has to loop forever, so a plain idle loop must follow the
  // cuts. Without one there is nothing sensible to fall back to.
  const loop = names.find((name) => name === 'loop_2') ?? names.find((name) => name === 'loop')
  if (loop && !sequence.includes(loop)) sequence.push(loop)
  return sequence
}

// `sequence` from the config file: an explicit list, or the literal 'auto'.
export function resolveSequence(sequence, list) {
  if (sequence === 'auto') return pickEntranceSequence(list)
  if (!Array.isArray(sequence)) return []
  return sequence.filter((name) => typeof name === 'string' && name)
}
