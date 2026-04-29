import { describe, expect, it } from 'vitest'
import {
  buildMissionPayload,
  clampAltitude,
  computeRouteStats,
  createWaypoint,
  reorderWaypoints,
  type MissionPoint,
} from './mission'
import { DEFAULT_WAYPOINT_CAMERA } from './camera'

const takeoff: MissionPoint = {
  id: 'takeoff',
  role: 'takeoff',
  name: '起飞点',
  lng: 116.397389,
  lat: 39.908722,
  altitude: 80,
}

const waypointA: MissionPoint = {
  id: 'wp-1',
  role: 'waypoint',
  name: '航点 1',
  lng: 116.3992,
  lat: 39.9108,
  altitude: 110,
}

const returnHome: MissionPoint = {
  id: 'return',
  role: 'return',
  name: '返航点',
  lng: 116.401428,
  lat: 39.914777,
  altitude: 120,
}

describe('mission helpers', () => {
  it('clamps invalid and negative altitudes to zero', () => {
    expect(clampAltitude(-20)).toBe(0)
    expect(clampAltitude(Number.NaN)).toBe(0)
    expect(clampAltitude(120)).toBe(120)
  })

  it('creates sequential waypoint names and keeps picked coordinates', () => {
    expect(createWaypoint({ lng: 116.4, lat: 39.91 }, 3)).toEqual({
      id: 'wp-3',
      role: 'waypoint',
      name: '航点 3',
      lng: 116.4,
      lat: 39.91,
      altitude: 100,
      camera: DEFAULT_WAYPOINT_CAMERA,
    })
  })

  it('computes multi-leg route stats for takeoff, waypoints, and return point', () => {
    const stats = computeRouteStats([takeoff, waypointA, returnHome])

    expect(stats.legCount).toBe(2)
    expect(stats.maxAltitude).toBe(120)
    expect(stats.minAltitude).toBe(80)
    expect(stats.totalHorizontalMeters).toBeGreaterThan(700)
    expect(stats.totalDirectMeters).toBeGreaterThan(stats.totalHorizontalMeters)
  })

  it('exports takeoff, ordered waypoints, and returnHome in the mission payload', () => {
    expect(buildMissionPayload([takeoff, waypointA, returnHome])).toEqual({
      missionType: 'uav-route-planning',
      takeoff: {
        longitude: 116.397389,
        latitude: 39.908722,
        altitudeMeters: 80,
      },
      waypoints: [
        {
          id: 'wp-1',
          name: '航点 1',
          longitude: 116.3992,
          latitude: 39.9108,
          altitudeMeters: 110,
          camera: DEFAULT_WAYPOINT_CAMERA,
        },
      ],
      returnHome: {
        longitude: 116.401428,
        latitude: 39.914777,
        altitudeMeters: 120,
      },
    })
  })

  it('moves only waypoint items and keeps takeoff/return fixed at the ends', () => {
    const waypointB: MissionPoint = { ...waypointA, id: 'wp-2', name: '航点 2' }
    const reordered = reorderWaypoints([takeoff, waypointA, waypointB, returnHome], 'wp-2', -1)

    expect(reordered.map((point) => point.id)).toEqual(['takeoff', 'wp-2', 'wp-1', 'return'])
    expect(reorderWaypoints(reordered, 'wp-2', -1).map((point) => point.id)).toEqual([
      'takeoff',
      'wp-2',
      'wp-1',
      'return',
    ])
  })
})
