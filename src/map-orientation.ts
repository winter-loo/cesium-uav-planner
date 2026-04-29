const DIRECTION_LABELS = [
  '上方',
  '左上',
  '左侧',
  '左下',
  '下方',
  '右下',
  '右侧',
  '右上',
] as const

export function normalizeHeadingDegrees(value: number) {
  if (!Number.isFinite(value)) return 0
  return ((Math.round(value) % 360) + 360) % 360
}

export function getNorthScreenDirection(heading: number) {
  const normalized = normalizeHeadingDegrees(heading)
  const index = Math.round(normalized / 45) % DIRECTION_LABELS.length
  return DIRECTION_LABELS[index]
}

export function formatMapHeading(heading: number) {
  const normalized = normalizeHeadingDegrees(heading)
  return `${getNorthScreenDirection(normalized)} ${normalized}°`
}

export function describeNorthDirection(heading: number) {
  return `正北朝屏幕${getNorthScreenDirection(heading)}`
}
