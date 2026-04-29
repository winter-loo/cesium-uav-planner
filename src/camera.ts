import type { MissionPoint } from './mission'

export type WaypointCamera = {
  heading: number
  pitch: number
  roll: number
  fov: number
  range: number
  aspectRatio: number
}

export const DEFAULT_WAYPOINT_CAMERA: WaypointCamera = {
  heading: 0,
  pitch: -55,
  roll: 0,
  fov: 32,
  range: 160,
  aspectRatio: 16 / 9,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeDegrees(value: number) {
  if (!Number.isFinite(value)) return 0
  return ((value % 360) + 360) % 360
}

function normalizeSignedDegrees(value: number) {
  const normalized = normalizeDegrees(value)
  return normalized > 180 ? normalized - 360 : normalized
}

export function normalizeWaypointCamera(camera?: Partial<WaypointCamera>): WaypointCamera {
  return {
    heading: normalizeDegrees(camera?.heading ?? DEFAULT_WAYPOINT_CAMERA.heading),
    pitch: clamp(camera?.pitch ?? DEFAULT_WAYPOINT_CAMERA.pitch, -89, 89),
    roll: normalizeSignedDegrees(camera?.roll ?? DEFAULT_WAYPOINT_CAMERA.roll),
    fov: clamp(camera?.fov ?? DEFAULT_WAYPOINT_CAMERA.fov, 10, 120),
    range: clamp(camera?.range ?? DEFAULT_WAYPOINT_CAMERA.range, 20, 1000),
    aspectRatio: clamp(camera?.aspectRatio ?? DEFAULT_WAYPOINT_CAMERA.aspectRatio, 0.5, 3),
  }
}

export function getWaypointCamera(point: MissionPoint) {
  return normalizeWaypointCamera(point.camera)
}
