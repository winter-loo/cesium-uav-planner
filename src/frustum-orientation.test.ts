import {
  Cartesian3,
  Cartesian4,
  HeadingPitchRoll,
  Math as CesiumMath,
  Matrix3,
  Matrix4,
  Transforms,
} from 'cesium'
import { describe, expect, it } from 'vitest'
import { createFrustumOrientation } from './frustum-orientation'

function getEnuAxes(origin: Cartesian3) {
  const frame = Transforms.eastNorthUpToFixedFrame(origin)

  return {
    east: Cartesian3.fromCartesian4(Matrix4.getColumn(frame, 0, new Cartesian4()), new Cartesian3()),
    north: Cartesian3.fromCartesian4(Matrix4.getColumn(frame, 1, new Cartesian4()), new Cartesian3()),
    up: Cartesian3.fromCartesian4(Matrix4.getColumn(frame, 2, new Cartesian4()), new Cartesian3()),
  }
}

function getFrustumAxes(origin: Cartesian3, heading: number, pitch: number, roll = 0) {
  const orientation = createFrustumOrientation(
    origin,
    HeadingPitchRoll.fromDegrees(heading, pitch, roll),
  )
  const rotation = Matrix3.fromQuaternion(orientation)

  return {
    right: Matrix3.getColumn(rotation, 0, new Cartesian3()),
    up: Matrix3.getColumn(rotation, 1, new Cartesian3()),
    direction: Matrix3.getColumn(rotation, 2, new Cartesian3()),
  }
}

describe('createFrustumOrientation', () => {
  it('points heading 0 pitch 0 horizontally toward local north', () => {
    const origin = Cartesian3.fromDegrees(116.4, 39.91, 120)
    const axes = getEnuAxes(origin)
    const frustumAxes = getFrustumAxes(origin, 0, 0)

    expect(Cartesian3.dot(frustumAxes.direction, axes.north)).toBeCloseTo(1, 6)
    expect(Cartesian3.dot(frustumAxes.direction, axes.up)).toBeCloseTo(0, 6)
    expect(Cartesian3.dot(frustumAxes.up, axes.up)).toBeCloseTo(1, 6)
  })

  it('turns heading 90 degrees toward local east', () => {
    const origin = Cartesian3.fromDegrees(116.4, 39.91, 120)
    const axes = getEnuAxes(origin)
    const frustumAxes = getFrustumAxes(origin, 90, 0)

    expect(Cartesian3.dot(frustumAxes.direction, axes.east)).toBeCloseTo(1, 6)
    expect(Cartesian3.dot(frustumAxes.direction, axes.up)).toBeCloseTo(0, 6)
  })

  it('tilts downward when pitch is negative', () => {
    const origin = Cartesian3.fromDegrees(116.4, 39.91, 120)
    const axes = getEnuAxes(origin)
    const frustumAxes = getFrustumAxes(origin, 0, -45)

    expect(Cartesian3.dot(frustumAxes.direction, axes.north)).toBeCloseTo(
      Math.cos(CesiumMath.toRadians(45)),
      6,
    )
    expect(Cartesian3.dot(frustumAxes.direction, axes.up)).toBeCloseTo(
      -Math.sin(CesiumMath.toRadians(45)),
      6,
    )
  })
})
