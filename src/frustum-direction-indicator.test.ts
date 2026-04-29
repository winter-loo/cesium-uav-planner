import { Cartesian3, HeadingPitchRoll, Matrix3 } from 'cesium'
import { describe, expect, it } from 'vitest'
import { createFrustumDirectionIndicator } from './frustum-direction-indicator'
import { createFrustumOrientation } from './frustum-orientation'

describe('createFrustumDirectionIndicator', () => {
  it('starts at the waypoint origin and extends along the frustum direction axis', () => {
    const origin = Cartesian3.fromDegrees(116.4, 39.91, 120)
    const orientation = createFrustumOrientation(origin, HeadingPitchRoll.fromDegrees(0, -45, 0))
    const length = 40

    const indicator = createFrustumDirectionIndicator({ origin, orientation, length })
    const rotation = Matrix3.fromQuaternion(orientation)
    const direction = Matrix3.getColumn(rotation, 2, new Cartesian3())
    const expectedEnd = Cartesian3.add(
      origin,
      Cartesian3.multiplyByScalar(direction, length, new Cartesian3()),
      new Cartesian3(),
    )

    expect(indicator.positions).toHaveLength(2)
    expect(indicator.positions[0]).toEqual(origin)
    expect(indicator.positions[1].x).toBeCloseTo(expectedEnd.x, 6)
    expect(indicator.positions[1].y).toBeCloseTo(expectedEnd.y, 6)
    expect(indicator.positions[1].z).toBeCloseTo(expectedEnd.z, 6)
  })

  it('clamps indicator length into a visible safe range', () => {
    const origin = Cartesian3.fromDegrees(116.4, 39.91, 120)
    const orientation = createFrustumOrientation(origin, HeadingPitchRoll.fromDegrees(90, 0, 0))

    const shortIndicator = createFrustumDirectionIndicator({ origin, orientation, length: 1 })
    const longIndicator = createFrustumDirectionIndicator({ origin, orientation, length: 5000 })

    expect(Cartesian3.distance(shortIndicator.positions[0], shortIndicator.positions[1])).toBeCloseTo(8, 6)
    expect(Cartesian3.distance(longIndicator.positions[0], longIndicator.positions[1])).toBeCloseTo(120, 6)
  })
})
