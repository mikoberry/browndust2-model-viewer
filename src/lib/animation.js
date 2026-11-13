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
