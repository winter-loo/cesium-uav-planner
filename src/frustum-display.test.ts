import {
  Cartesian3,
  FrustumGeometry,
  FrustumOutlineGeometry,
  PerspectiveFrustum,
  Quaternion,
} from 'cesium'
import { describe, expect, it } from 'vitest'
import { createFrustumDisplay } from './frustum-display'

describe('createFrustumDisplay', () => {
  it('creates both filled and outline frustum geometry with distinct appearances', () => {
    const origin = Cartesian3.fromDegrees(116.4, 39.91, 120)
    const orientation = Quaternion.IDENTITY
    const frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 16 / 9,
      near: 1,
      far: 150,
    })

    const display = createFrustumDisplay({ origin, orientation, frustum })

    expect(display.fillInstance.geometry).toBeInstanceOf(FrustumGeometry)
    expect(display.outlineInstance.geometry).toBeInstanceOf(FrustumOutlineGeometry)
    expect(display.fillAppearance.translucent).toBe(true)
    expect(display.fillAppearance.closed).toBe(true)
    expect(display.outlineAppearance.translucent).toBe(true)
    expect(display.outlineAppearance.closed).toBe(false)
  })
})
