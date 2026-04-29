import { Cartesian3, Matrix3, Quaternion } from 'cesium'

const MIN_DIRECTION_INDICATOR_LENGTH = 8
const MAX_DIRECTION_INDICATOR_LENGTH = 120

interface FrustumDirectionIndicatorOptions {
  origin: Cartesian3
  orientation: Quaternion
  length: number
}

export function createFrustumDirectionIndicator({
  origin,
  orientation,
  length,
}: FrustumDirectionIndicatorOptions) {
  const clampedLength = Math.min(
    Math.max(length, MIN_DIRECTION_INDICATOR_LENGTH),
    MAX_DIRECTION_INDICATOR_LENGTH,
  )
  const rotation = Matrix3.fromQuaternion(orientation)
  const direction = Matrix3.getColumn(rotation, 2, new Cartesian3())
  const end = Cartesian3.add(
    origin,
    Cartesian3.multiplyByScalar(direction, clampedLength, new Cartesian3()),
    new Cartesian3(),
  )

  return {
    positions: [Cartesian3.clone(origin), end],
    clampedLength,
  }
}
