// BD2 cutscene skeletons sometimes split one shot into several animations that
// only make sense played together: a `cut_A` / `loop` body animation plus
// `cut_A_water` / `loop_bowl` siblings that either drive a few prop bones or
// re-key the slots of an alternate prop state. Playing only the base clip then
// looks broken (no water, no bowl, missing prop switches).
//
// The runtime could stack them on two tracks, but then every consumer
// (entrance sequence, click-to-play, seek, progress) has to know about pairs.
// Instead the layers are folded into the base animation once, right after
// loading: the base keeps its timelines, the layer's timelines are appended and
// take over the bone / slot they key. One name still means one complete shot,
// and the layer entries are marked so the UI can hide them.
//
// Pure: works on the plain `skeletonData` object, no spine imports, so it runs
// in Node too.

const NUMERIC_SUFFIX = /_\d+$/
// Shots only combine when both cuts are the same length; `_idle` / `_act`
// siblings are separate, shorter clips and must stay selectable.
const DURATION_EPSILON = 0.02
// A folded layer only drives the prop / effect it adds, so it touches a
// fraction of the base's bones. Anything close to the base in size is a
// different take of the shot (a re-drawn cut), not something to fold in.
const LAYER_BONE_RATIO = 0.6
// Once a layer is folded, a sibling that drives the same bones is a different
// take of that same effect (a second pet / sound / weapon), not an extra part.
const ALTERNATE_TAKE_RATIO = 0.6

// BD2 exports attachment timelines as full slot snapshots: every slot the clip
// does not draw is keyed `null` at time 0. That makes "the last writer wins"
// wrong — `cut_A_bowl` only draws the hands and the bowl, so folding it by
// replacement deletes the body, the face and the hair from `cut_A` (the shot
// renders as a floating hand holding a bowl). Attachment timelines therefore
// merge instead of replace, and `null` never overrides a real name.
// Detected by shape, NOT by `constructor.name`: the production build runs the
// bundle through esbuild, which renames every class (`AttachmentTimeline` ships
// as `Ws` in dist/), so a name check silently fails once built and the fold
// falls back to "last writer wins" — `cut_A_bowl` then blanks the body and the
// shot renders as a lone hand holding a bowl. `attachmentNames` only exists on
// AttachmentTimeline, which makes it a reliable marker in dev and in dist.
function isAttachmentTimeline(timeline) {
  return Array.isArray(timeline?.attachmentNames)
}

// Value the clip holds at `time`. `undefined` means its first key is still in
// the future, i.e. the setup pose decides until then.
function attachmentValueAt(timeline, time) {
  let value
  const frames = timeline.frames ?? []
  for (let i = 0; i < frames.length && frames[i] <= time; i += 1) {
    value = timeline.attachmentNames?.[i]
  }
  return value
}

// Folds `layerTimeline` into `baseTimeline` in place, unioning both key sets.
// A real name from the layer wins; a `null` from the layer keeps whatever the
// base shows (the layer is simply not drawing that slot). When both key the
// slot `null` the result is `null`, so real hide transitions survive.
function foldAttachmentTimeline(baseTimeline, layerTimeline) {
  const times = [...new Set([...(baseTimeline.frames ?? []), ...(layerTimeline.frames ?? [])])].sort(
    (a, b) => a - b,
  )
  const frames = []
  const names = []
  for (const time of times) {
    const baseValue = attachmentValueAt(baseTimeline, time)
    const layerValue = attachmentValueAt(layerTimeline, time)
    const value = layerValue === undefined ? baseValue : (layerValue ?? baseValue)
    if (value === undefined) continue
    if (names.length && names[names.length - 1] === value) continue
    frames.push(time)
    names.push(value)
  }
  baseTimeline.frames = frames
  baseTimeline.attachmentNames = names
}

// Unique id of what a timeline writes. `Animation.getPropertyId()` is empty in
// the 4.1 builds this project uses, so the target index is rebuilt from the
// timeline itself: the timeline type plus the bone / slot / constraint it keys.
//
// The type half is a per-class sequence number instead of `constructor.name`:
// minification renames classes, and two renamed classes from different modules
// can even collide, which would key two unrelated timeline types identically.
const TYPE_IDS = new WeakMap()
let nextTypeId = 1

function timelineTypeId(timeline) {
  const ctor = timeline?.constructor
  if (!ctor) return 0
  let id = TYPE_IDS.get(ctor)
  if (id == null) {
    id = nextTypeId
    nextTypeId += 1
    TYPE_IDS.set(ctor, id)
  }
  return id
}

function timelineKey(timeline) {
  const type = `t${timelineTypeId(timeline)}`
  if (timeline.boneIndex != null) return `${type}:b${timeline.boneIndex}`
  if (timeline.slotIndex != null) return `${type}:s${timeline.slotIndex}`
  if (timeline.constraintIndex != null) return `${type}:c${timeline.constraintIndex}`
  return type
}

function animatedBones(animation) {
  const set = new Set()
  for (const timeline of animation.timelines ?? []) {
    if (timeline.boneIndex != null) set.add(timeline.boneIndex)
  }
  return set
}

// Pairs `{ base, layer }` that should be merged. Detection is deliberately
// conservative — a wrong merge is visible, an unsplit clip is not, so only
// same-length pairs whose layer animates the base's bones or a small subset of
// them qualify.
export function detectClipLayers(animations) {
  const list = animations ?? []
  const byName = new Map(list.map((animation) => [animation.name, animation]))
  const boneCache = new Map()
  const bonesOf = (animation) => {
    if (!boneCache.has(animation.name)) boneCache.set(animation.name, animatedBones(animation))
    return boneCache.get(animation.name)
  }

  const pairs = []
  for (const layer of list) {
    const name = layer?.name
    if (typeof name !== 'string') continue
    // `loop_2` / `cut_A_3` are alternate idles, never layers.
    if (NUMERIC_SUFFIX.test(name)) continue
    const cut = name.lastIndexOf('_')
    if (cut <= 0) continue
    const base = byName.get(name.slice(0, cut))
    if (!base || base === layer) continue
    if (Math.abs((base.duration ?? 0) - (layer.duration ?? 0)) > DURATION_EPSILON) continue

    const baseBones = bonesOf(base)
    const layerBones = bonesOf(layer)
    // Draw-order / event only clips carry no bone of their own: not a layer.
    if (!layerBones.size) continue
    const sameBones =
      baseBones.size === layerBones.size && [...baseBones].every((bone) => layerBones.has(bone))
    const smallEnough = layerBones.size <= baseBones.size * LAYER_BONE_RATIO
    if (!sameBones && !smallEnough) continue

    pairs.push({ base: base.name, layer: name, sameBones, bones: [baseBones.size, layerBones.size] })
  }
  return pairs
}

// Folds every detected layer into its base animation, in place.
// Returns `[{ base, layers: [name…] }]` for reporting / UI, or [] when the
// skeleton needs nothing.
export function mergeClipLayers(skeletonData) {
  const animations = skeletonData?.animations
  if (!Array.isArray(animations)) return []
  const pairs = detectClipLayers(animations)
  if (!pairs.length) return []

  const byName = new Map(animations.map((animation) => [animation.name, animation]))
  const slots = skeletonData.slots ?? []
  const setupAttachmentOf = (index) => slots[index]?.attachmentName ?? slots[index]?._attachmentName
  // A layer can itself be a base (`cut_a` -> `cut_a_hand` -> `cut_a_hand_f`),
  // so every layer is pushed onto the ROOT of its chain.
  const parentOf = new Map(pairs.map((pair) => [pair.layer, pair.base]))
  const groups = new Map()
  for (const pair of pairs) {
    let root = pair.layer
    const seen = new Set()
    while (parentOf.has(root) && !seen.has(root)) {
      seen.add(root)
      root = parentOf.get(root)
    }
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(pair.layer)
  }

  const report = []
  for (const [rootName, layers] of groups) {
    const base = byName.get(rootName)
    if (!base) continue
    // Base timelines first, then the layers; a key written by a layer replaces
    // the base's version (a Map keeps the first insertion position, so the
    // per-bone ordering of the base stays intact).
    const merged = new Map()
    for (const timeline of base.timelines ?? []) merged.set(timelineKey(timeline), timeline)
    let duration = base.duration ?? 0
    const folded = []
    // A layer that drives the bones an earlier layer already drives is an
    // alternative take of the same effect (`cut_B_snake` / `cut_B_sword` /
    // `cut_B_water`, four optional pets, three optional sound bursts), not
    // something to stack: the first one is folded and the rest stay listed as
    // selectable clips. Measured on bones, not timeline keys — BD2 writes a
    // full slot snapshot into every clip, so key overlap says nothing.
    const foldedBones = new Set()
    for (const layerName of layers) {
      const layer = byName.get(layerName)
      if (!layer) continue
      // Attachment keys are unioned (`foldAttachmentTimeline`), so sharing a
      // slot with an already folded layer is normal — BD2 writes a full slot
      // snapshot in every clip. Only bone overlap marks an alternative take.
      const layerBones = animatedBones(layer)
      if (layerBones.size) {
        let sharedBones = 0
        for (const bone of layerBones) if (foldedBones.has(bone)) sharedBones += 1
        if (sharedBones / layerBones.size >= ALTERNATE_TAKE_RATIO) continue
      }
      // Attachments the layer actually draws. BD2 ships several slots per shape
      // (`A_arm_r4_bbb` / `A_arm_r4_fff` share the setup attachment `A_arm_r4`)
      // and each clip uses one of them; a slot whose attachment is drawn by
      // another slot of the layer must stay hidden or the part renders twice.
      const drawnAttachments = new Set()
      for (const timeline of layer.timelines ?? []) {
        if (!isAttachmentTimeline(timeline)) continue
        if (!(timeline.attachmentNames ?? []).some((name) => name != null)) continue
        const attachment = setupAttachmentOf(timeline.slotIndex)
        if (attachment != null) drawnAttachments.add(attachment)
      }
      for (const timeline of layer.timelines ?? []) {
        const key = timelineKey(timeline)
        const existing = merged.get(key)
        if (isAttachmentTimeline(timeline)) {
          if (isAttachmentTimeline(existing)) {
            // Same slot in both clips: union the key sets (see
            // `foldAttachmentTimeline`), otherwise the layer's null padding
            // would blank out everything the base draws.
            foldAttachmentTimeline(existing, timeline)
          } else if (!existing) {
            // Slot the base never touches, so the setup pose owns it. A layer
            // timeline that is nothing but `null` padding means "not drawn
            // here", not "hide it": keep the setup pose, unless another slot
            // of this layer draws the same attachment.
            const names = timeline.attachmentNames ?? []
            const drawn = names.some((name) => name != null)
            const replacedByTwin =
              !drawn && setupAttachmentOf(timeline.slotIndex) != null
                ? drawnAttachments.has(setupAttachmentOf(timeline.slotIndex))
                : false
            if (drawn || replacedByTwin) merged.set(key, timeline)
          }
          continue
        }
        merged.set(key, timeline)
      }
      for (const bone of layerBones) foldedBones.add(bone)
      duration = Math.max(duration, layer.duration ?? 0)
      // Marker read by `readAssetInfo` so the UI hides the sub-clip.
      layer.clipLayerOf = rootName
      folded.push(layerName)
    }
    if (!folded.length) continue

    // Slots the folded layers never key. The base hides them with a single
    // `null` key, but a layer renders from its own setup pose, where the
    // attachment is visible (`A_water`: `cut_A` keys it `null`, `cut_A_water`
    // never touches it). Union means "visible when the layer shows it", so
    // that all-null base key goes away and the setup pose decides again.
    // Only the folded layers count: clips that were skipped as alternate takes
    // (`A_cut_w2` next to `A_cut_w1`) key their own props `null` and must not
    // hide what the folded one relies on.
    const touchedBy = new Map()
    for (const layerName of folded) {
      const set = new Set()
      for (const timeline of byName.get(layerName)?.timelines ?? []) {
        if (isAttachmentTimeline(timeline)) set.add(timeline.slotIndex)
      }
      touchedBy.set(layerName, set)
    }
    for (const [key, timeline] of merged) {
      if (!isAttachmentTimeline(timeline)) continue
      if ((timeline.attachmentNames ?? []).some((name) => name != null)) continue
      if (setupAttachmentOf(timeline.slotIndex) == null) continue
      // A layer that never keys the slot renders it from its own setup pose,
      // so the base's `null` must not win. Only when *every* folded layer
      // explicitly hides it does the key survive.
      if (folded.every((layerName) => touchedBy.get(layerName)?.has(timeline.slotIndex))) continue
      merged.delete(key)
    }

    base.timelines = [...merged.values()]
    base.duration = duration
    report.push({ base: rootName, layers: folded })
  }
  return report
}
