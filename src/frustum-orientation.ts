import {
  Cartesian3,
  Cartesian4,
  HeadingPitchRoll,
  Matrix3,
  Matrix4,
  Quaternion,
  Transforms,
} from 'cesium'

const scratchFrame = new Matrix4()
const scratchRotation = new Matrix3()
const scratchRollRotation = new Matrix3()
const scratchEast4 = new Cartesian4()
const scratchNorth4 = new Cartesian4()
const scratchUp4 = new Cartesian4()
const scratchEast3 = new Cartesian3()
const scratchNorth3 = new Cartesian3()
const scratchUp3 = new Cartesian3()
const scratchHorizontalNorth = new Cartesian3()
const scratchHorizontalEast = new Cartesian3()
const scratchDirection = new Cartesian3()
const scratchRight = new Cartesian3()
const scratchUpVector = new Cartesian3()
const scratchNegatedRight = new Cartesian3()

export function createFrustumOrientation(origin: Cartesian3, headingPitchRoll: HeadingPitchRoll) {
  const frame = Transforms.eastNorthUpToFixedFrame(origin, undefined, scratchFrame)
  const east = Cartesian3.fromCartesian4(Matrix4.getColumn(frame, 0, scratchEast4), scratchEast3)
  const north = Cartesian3.fromCartesian4(Matrix4.getColumn(frame, 1, scratchNorth4), scratchNorth3)
  const up = Cartesian3.fromCartesian4(Matrix4.getColumn(frame, 2, scratchUp4), scratchUp3)

  const heading = headingPitchRoll.heading
  const pitch = headingPitchRoll.pitch
  const roll = headingPitchRoll.roll

  const horizontalNorth = Cartesian3.multiplyByScalar(
    north,
    Math.cos(heading),
    scratchHorizontalNorth,
  )
  const horizontalEast = Cartesian3.multiplyByScalar(
    east,
    Math.sin(heading),
    scratchHorizontalEast,
  )
  const horizontalDirection = Cartesian3.add(horizontalNorth, horizontalEast, scratchDirection)
  Cartesian3.normalize(horizontalDirection, horizontalDirection)

  const leveledRight = Cartesian3.cross(horizontalDirection, up, scratchRight)
  Cartesian3.normalize(leveledRight, leveledRight)

  const pitchedHorizontal = Cartesian3.multiplyByScalar(
    horizontalDirection,
    Math.cos(pitch),
    scratchDirection,
  )
  const pitchedVertical = Cartesian3.multiplyByScalar(up, Math.sin(pitch), scratchUpVector)
  const direction = Cartesian3.add(pitchedHorizontal, pitchedVertical, scratchDirection)
  Cartesian3.normalize(direction, direction)

  const unrolledUp = Cartesian3.cross(leveledRight, direction, scratchUpVector)
  Cartesian3.normalize(unrolledUp, unrolledUp)

  let right = leveledRight
  let finalUp = unrolledUp

  if (roll !== 0) {
    const rollQuaternion = Quaternion.fromAxisAngle(direction, roll)
    const rollMatrix = Matrix3.fromQuaternion(rollQuaternion, scratchRollRotation)
    right = Matrix3.multiplyByVector(rollMatrix, leveledRight, scratchRight)
    finalUp = Matrix3.multiplyByVector(rollMatrix, unrolledUp, scratchUpVector)
    Cartesian3.normalize(right, right)
    Cartesian3.normalize(finalUp, finalUp)
  }

  Matrix3.setColumn(
    scratchRotation,
    0,
    Cartesian3.negate(right, scratchNegatedRight),
    scratchRotation,
  )
  Matrix3.setColumn(scratchRotation, 1, finalUp, scratchRotation)
  Matrix3.setColumn(scratchRotation, 2, direction, scratchRotation)

  return Quaternion.fromRotationMatrix(scratchRotation, new Quaternion())
}
