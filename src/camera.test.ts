import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WAYPOINT_CAMERA,
  getWaypointCamera,
  normalizeWaypointCamera,
  type WaypointCamera,
} from './camera'
import type { MissionPoint } from './mission'

describe('waypoint camera helpers', () => {
  it('returns default camera settings for waypoints without camera config', () => {
    const waypoint = {
      id: 'wp-1',
      role: 'waypoint',
      name: '航点 1',
      lng: 116.4,
      lat: 39.91,
      altitude: 100,
    } satisfies MissionPoint

    expect(getWaypointCamera(waypoint)).toEqual(DEFAULT_WAYPOINT_CAMERA)
  })

  it('normalizes camera settings into safe ranges', () => {
    const camera = normalizeWaypointCamera({
      heading: 725,
      pitch: -120,
      roll: 250,
      fov: 2,
      range: -5,
      aspectRatio: 9,
    })

    expect(camera).toEqual({
      heading: 5,
      pitch: -89,
      roll: -110,
      fov: 10,
      range: 20,
      aspectRatio: 3,
    })
  })

  it('keeps valid custom camera values intact', () => {
    const customCamera: WaypointCamera = {
      heading: 135,
      pitch: -62,
      roll: 8,
      fov: 42,
      range: 180,
      aspectRatio: 1.4,
    }

    expect(normalizeWaypointCamera(customCamera)).toEqual(customCamera)
  })
})
