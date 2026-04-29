import { Cartographic, EllipsoidGeodesic } from 'cesium'
import { DEFAULT_WAYPOINT_CAMERA, normalizeWaypointCamera, type WaypointCamera } from './camera'

export type MissionPointRole = 'takeoff' | 'waypoint' | 'return'

export type GeoPoint = {
  lng: number
  lat: number
}

export type MissionPoint = GeoPoint & {
  id: string
  role: MissionPointRole
  name: string
  altitude: number
  camera?: WaypointCamera
}

export type RouteStats = {
  legCount: number
  totalHorizontalMeters: number
  totalDirectMeters: number
  maxAltitude: number
  minAltitude: number
  altitudeDelta: number
}

export const DEFAULT_TAKEOFF: MissionPoint = {
  id: 'takeoff',
  role: 'takeoff',
  name: '起飞点',
  lng: 116.397389,
  lat: 39.908722,
  altitude: 80,
}

export const DEFAULT_RETURN: MissionPoint = {
  id: 'return',
  role: 'return',
  name: '返航点',
  lng: 116.401428,
  lat: 39.914777,
  altitude: 120,
}

export const DEFAULT_WAYPOINTS: MissionPoint[] = [
  DEFAULT_TAKEOFF,
  {
    id: 'wp-1',
    role: 'waypoint',
    name: '航点 1',
    lng: 116.3992,
    lat: 39.9108,
    altitude: 100,
  },
  DEFAULT_RETURN,
]

export function clampAltitude(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, value)
}

export function round(value: number, digits = 1) {
  return Number(value.toFixed(digits))
}

export function formatNumber(value: number, digits = 6) {
  return value.toFixed(digits)
}

export function createWaypoint(point: GeoPoint, sequence: number): MissionPoint {
  return {
    id: `wp-${sequence}`,
    role: 'waypoint',
    name: `航点 ${sequence}`,
    lng: point.lng,
    lat: point.lat,
    altitude: 100,
    camera: DEFAULT_WAYPOINT_CAMERA,
  }
}

export function getHorizontalDistanceMeters(start: GeoPoint, end: GeoPoint) {
  const geodesic = new EllipsoidGeodesic(
    Cartographic.fromDegrees(start.lng, start.lat),
    Cartographic.fromDegrees(end.lng, end.lat),
  )

  return geodesic.surfaceDistance
}

export function computeRouteStats(points: MissionPoint[]): RouteStats {
  const legStats = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1]
    const horizontalMeters = getHorizontalDistanceMeters(point, next)
    const altitudeDelta = next.altitude - point.altitude

    return {
      horizontalMeters,
      directMeters: Math.sqrt(horizontalMeters ** 2 + altitudeDelta ** 2),
    }
  })

  const altitudes = points.map((point) => point.altitude)
  const first = points[0]
  const last = points.at(-1)

  return {
    legCount: Math.max(points.length - 1, 0),
    totalHorizontalMeters: round(
      legStats.reduce((total, leg) => total + leg.horizontalMeters, 0),
      1,
    ),
    totalDirectMeters: round(
      legStats.reduce((total, leg) => total + leg.directMeters, 0),
      1,
    ),
    maxAltitude: Math.max(...altitudes),
    minAltitude: Math.min(...altitudes),
    altitudeDelta: first && last ? round(last.altitude - first.altitude, 1) : 0,
  }
}

export function buildMissionPayload(points: MissionPoint[]) {
  const takeoff = points.find((point) => point.role === 'takeoff') ?? points[0]
  const returnHome = points.find((point) => point.role === 'return') ?? points[points.length - 1]
  const waypoints = points.filter((point) => point.role === 'waypoint')

  if (!takeoff || !returnHome) {
    throw new Error('Mission payload requires at least one takeoff/return point')
  }

  return {
    missionType: 'uav-route-planning',
    takeoff: {
      longitude: takeoff.lng,
      latitude: takeoff.lat,
      altitudeMeters: takeoff.altitude,
    },
    waypoints: waypoints.map((point) => ({
      id: point.id,
      name: point.name,
      longitude: point.lng,
      latitude: point.lat,
      altitudeMeters: point.altitude,
      camera: normalizeWaypointCamera(point.camera),
    })),
    returnHome: {
      longitude: returnHome.lng,
      latitude: returnHome.lat,
      altitudeMeters: returnHome.altitude,
    },
  }
}

export function updateMissionPoint(
  points: MissionPoint[],
  id: string,
  patch: Partial<Omit<MissionPoint, 'id' | 'role'>>,
) {
  return points.map((point) => (point.id === id ? { ...point, ...patch } : point))
}

export function appendWaypoint(points: MissionPoint[], waypoint: MissionPoint) {
  const returnIndex = points.findIndex((point) => point.role === 'return')

  if (returnIndex === -1) return [...points, waypoint]

  return [
    ...points.slice(0, returnIndex),
    waypoint,
    ...points.slice(returnIndex),
  ]
}

export function removeWaypoint(points: MissionPoint[], id: string) {
  return points.filter((point) => point.role !== 'waypoint' || point.id !== id)
}

export function reorderWaypoints(points: MissionPoint[], id: string, direction: -1 | 1): MissionPoint[] {
  const takeoff = points.find((point) => point.role === 'takeoff') ?? points[0]
  const returnHome = points.find((point) => point.role === 'return') ?? points[points.length - 1]
  const waypoints = points.filter((point) => point.role === 'waypoint')
  const currentIndex = waypoints.findIndex((point) => point.id === id)

  if (!takeoff || !returnHome || currentIndex === -1) return points

  const nextIndex = currentIndex + direction
  if (nextIndex < 0 || nextIndex >= waypoints.length) return points

  const reordered = [...waypoints]
  const moved = reordered[currentIndex]

  if (!moved) return points

  reordered.splice(currentIndex, 1)
  reordered.splice(nextIndex, 0, moved)

  return [takeoff, ...reordered, returnHome]
}
