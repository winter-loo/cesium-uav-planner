import {
  Color,
  ColorGeometryInstanceAttribute,
  FrustumGeometry,
  FrustumOutlineGeometry,
  GeometryInstance,
  PerInstanceColorAppearance,
  type Cartesian3,
  type PerspectiveFrustum,
  type Quaternion,
} from 'cesium'

const FRUSTUM_FILL_COLOR = Color.fromCssColorString('#d58936').withAlpha(0.18)
const FRUSTUM_OUTLINE_COLOR = Color.fromCssColorString('#d58936').withAlpha(0.9)

interface FrustumDisplayOptions {
  origin: Cartesian3
  orientation: Quaternion
  frustum: PerspectiveFrustum
}

export function createFrustumDisplay({ origin, orientation, frustum }: FrustumDisplayOptions) {
  return {
    fillInstance: new GeometryInstance({
      geometry: new FrustumGeometry({
        origin,
        orientation,
        frustum,
      }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(FRUSTUM_FILL_COLOR),
      },
    }),
    fillAppearance: new PerInstanceColorAppearance({
      flat: true,
      translucent: true,
      closed: true,
    }),
    outlineInstance: new GeometryInstance({
      geometry: new FrustumOutlineGeometry({
        origin,
        orientation,
        frustum,
      }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(FRUSTUM_OUTLINE_COLOR),
      },
    }),
    outlineAppearance: new PerInstanceColorAppearance({
      flat: true,
      translucent: true,
    }),
  }
}
