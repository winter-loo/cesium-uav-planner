import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Entity,
  HeadingPitchRoll,
  ImageryLayer,
  LabelStyle,
  Math as CesiumMath,
  PerspectiveFrustum,
  PolylineArrowMaterialProperty,
  Primitive,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import './App.css'
import {
  appendWaypoint,
  buildMissionPayload,
  clampAltitude,
  computeRouteStats,
  createWaypoint,
  DEFAULT_WAYPOINTS,
  formatNumber,
  removeWaypoint,
  reorderWaypoints,
  type GeoPoint,
  type MissionPoint,
  updateMissionPoint,
} from './mission'
import { getWaypointCamera, normalizeWaypointCamera, type WaypointCamera } from './camera'
import { createFrustumDisplay } from './frustum-display'
import { createFrustumDirectionIndicator } from './frustum-direction-indicator'
import { createFrustumOrientation } from './frustum-orientation'
import { describeNorthDirection, formatMapHeading, normalizeHeadingDegrees } from './map-orientation'
import {
  getTiandituLayers,
  normalizeTiandituToken,
  TIANDITU_SUBDOMAINS,
  type TiandituMapMode,
} from './tianditu'

type PlannerMode = 'idle' | 'pickTakeoff' | 'pickReturn' | 'pickWaypoint'

function getPointColor(point: MissionPoint) {
  if (point.role === 'takeoff') return '#f25f4c'
  if (point.role === 'return') return '#0f766e'
  return '#d58936'
}

function getPointLabel(point: MissionPoint, index: number) {
  if (point.role === 'takeoff') return '起飞点'
  if (point.role === 'return') return '返航点'
  return `航点 ${index}`
}

function getNextWaypointSequence(points: MissionPoint[]) {
  const usedNumbers = points
    .filter((point) => point.role === 'waypoint')
    .map((point) => Number(point.id.replace('wp-', '')))
    .filter(Number.isFinite)

  return usedNumbers.length === 0 ? 1 : Math.max(...usedNumbers) + 1
}

function getInitialWaypointSelection(points: MissionPoint[]) {
  return points.find((point) => point.role === 'waypoint')?.id ?? null
}

function getInitialTiandituToken() {
  const envToken = normalizeTiandituToken(import.meta.env.VITE_TIANDITU_TOKEN)
  if (typeof window === 'undefined') return envToken

  const savedToken = normalizeTiandituToken(window.localStorage.getItem('tianditu-token') ?? '')
  return savedToken || envToken
}

function App() {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const modeRef = useRef<PlannerMode>('idle')
  const tiandituLayerRefs = useRef<ImageryLayer[]>([])
  const frustumFillPrimitiveRef = useRef<Primitive | null>(null)
  const frustumOutlinePrimitiveRef = useRef<Primitive | null>(null)

  const [mode, setMode] = useState<PlannerMode>('idle')
  const [points, setPoints] = useState<MissionPoint[]>(DEFAULT_WAYPOINTS)
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(
    getInitialWaypointSelection(DEFAULT_WAYPOINTS),
  )
  const [lastAction, setLastAction] = useState('等待设置航点')
  const [copied, setCopied] = useState(false)
  const [tiandituMode, setTiandituMode] = useState<TiandituMapMode>('vector')
  const [tiandituToken, setTiandituToken] = useState(getInitialTiandituToken)
  const [viewerReady, setViewerReady] = useState(false)
  const [mapHeadingDegrees, setMapHeadingDegrees] = useState(0)

  const normalizedTiandituToken = normalizeTiandituToken(tiandituToken)

  const takeoffPoint = points.find((point) => point.role === 'takeoff') ?? points[0]
  const returnPoint = points.find((point) => point.role === 'return') ?? points.at(-1)!
  const waypointPoints = useMemo(
    () => points.filter((point) => point.role === 'waypoint'),
    [points],
  )
  const activeSelectedWaypointId = useMemo(
    () =>
      waypointPoints.some((point) => point.id === selectedWaypointId)
        ? selectedWaypointId
        : waypointPoints[0]?.id ?? null,
    [selectedWaypointId, waypointPoints],
  )
  const selectedWaypoint = useMemo(
    () => waypointPoints.find((point) => point.id === activeSelectedWaypointId) ?? null,
    [activeSelectedWaypointId, waypointPoints],
  )
  const routeStats = useMemo(() => computeRouteStats(points), [points])
  const payload = useMemo(() => buildMissionPayload(points), [points])

  useEffect(() => {
    if (!mapRef.current) return

    const viewer = new Viewer(mapRef.current, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
    })

    viewerRef.current = viewer
    setViewerReady(true)
    viewer.scene.globe.depthTestAgainstTerrain = false
    ;(viewer.cesiumWidget.creditContainer as HTMLElement).style.display = 'none'
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(116.3995, 39.9116, 2600),
      duration: 0,
    })

    const syncMapHeading = () => {
      setMapHeadingDegrees(normalizeHeadingDegrees(CesiumMath.toDegrees(viewer.camera.heading)))
    }

    viewer.camera.percentageChanged = 0.001
    viewer.camera.changed.addEventListener(syncMapHeading)
    syncMapHeading()

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const currentMode = modeRef.current

      if (currentMode === 'idle') {
        const pickedObject = viewer.scene.pick(event.position)
        const pickedEntity = pickedObject?.id

        if (pickedEntity instanceof Entity) {
          const pickedRole = pickedEntity.properties?.role?.getValue?.()
          const pickedWaypointId = pickedEntity.properties?.waypointId?.getValue?.()

          if (pickedRole === 'waypoint' && typeof pickedWaypointId === 'string') {
            setSelectedWaypointId(pickedWaypointId)
            setLastAction(`${pickedEntity.name ?? pickedWaypointId} 已选中，可调整云台视锥`)
          }
        }

        return
      }

      const cartesian = viewer.camera.pickEllipsoid(
        event.position,
        viewer.scene.globe.ellipsoid,
      )

      if (!cartesian) {
        setLastAction('未拾取到地表点，请点击地图上的陆地区域')
        return
      }

      const cartographic = Cartographic.fromCartesian(cartesian)
      const pickedPoint: GeoPoint = {
        lng: Number(CesiumMath.toDegrees(cartographic.longitude).toFixed(6)),
        lat: Number(CesiumMath.toDegrees(cartographic.latitude).toFixed(6)),
      }

      let createdWaypointId: string | null = null
      setPoints((currentPoints) => {
        if (currentMode === 'pickTakeoff') {
          return updateMissionPoint(currentPoints, 'takeoff', pickedPoint)
        }

        if (currentMode === 'pickReturn') {
          return updateMissionPoint(currentPoints, 'return', pickedPoint)
        }

        const nextSequence = getNextWaypointSequence(currentPoints)
        const waypoint = createWaypoint(pickedPoint, nextSequence)
        createdWaypointId = waypoint.id
        return appendWaypoint(currentPoints, waypoint)
      })

      if (currentMode === 'pickTakeoff') {
        setLastAction(`起飞点已更新：${pickedPoint.lng}, ${pickedPoint.lat}`)
      } else if (currentMode === 'pickReturn') {
        setLastAction(`返航点已更新：${pickedPoint.lng}, ${pickedPoint.lat}`)
      } else {
        setLastAction(`新航点已添加：${pickedPoint.lng}, ${pickedPoint.lat}`)
        if (createdWaypointId) {
          setSelectedWaypointId(createdWaypointId)
        }
      }

      setMode('idle')
    }, ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      viewer.camera.changed.removeEventListener(syncMapHeading)
      handler.destroy()
      tiandituLayerRefs.current = []
      frustumFillPrimitiveRef.current = null
      frustumOutlinePrimitiveRef.current = null
      viewer.destroy()
      viewerRef.current = null
      setViewerReady(false)
    }
  }, [])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    ;(viewer.container as HTMLElement).style.cursor = mode === 'idle' ? 'grab' : 'crosshair'
  }, [mode])

  useEffect(() => {
    window.localStorage.setItem('tianditu-token', tiandituToken)
  }, [tiandituToken])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    tiandituLayerRefs.current.forEach((layer) => {
      viewer.imageryLayers.remove(layer, false)
    })
    tiandituLayerRefs.current = []

    if (!normalizedTiandituToken) return

    tiandituLayerRefs.current = getTiandituLayers(tiandituMode, normalizedTiandituToken).map(
      (layerConfig) =>
        viewer.imageryLayers.addImageryProvider(
          new UrlTemplateImageryProvider({
            url: layerConfig.url,
            subdomains: TIANDITU_SUBDOMAINS,
            maximumLevel: 18,
            credit: layerConfig.label,
          }),
        ),
    )
  }, [normalizedTiandituToken, tiandituMode, viewerReady])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    viewer.entities.removeAll()

    let selectedWaypointOrientation: ReturnType<typeof createFrustumOrientation> | null = null
    let selectedWaypointOrigin: Cartesian3 | null = null
    let selectedWaypointRange = 0

    points.forEach((point, index) => {
      const color = Color.fromCssColorString(getPointColor(point))
      const waypointIndex = points
        .slice(0, index + 1)
        .filter((item) => item.role === 'waypoint').length

      viewer.entities.add({
        id: point.id,
        name: point.name,
        position: Cartesian3.fromDegrees(point.lng, point.lat, point.altitude),
        properties: {
          waypointId: point.id,
          role: point.role,
        },
        point: {
          color,
          outlineColor: Color.WHITE,
          outlineWidth: point.id === activeSelectedWaypointId ? 3 : 2,
          pixelSize: point.role === 'waypoint' ? (point.id === activeSelectedWaypointId ? 16 : 12) : 14,
        },
        label: {
          text: `${getPointLabel(point, waypointIndex)}\n${formatNumber(point.lng)} / ${formatNumber(point.lat)}\n${point.altitude} m`,
          font: '600 13px "Avenir Next", "PingFang SC", sans-serif',
          fillColor: Color.fromCssColorString('#1e1a18'),
          showBackground: true,
          backgroundColor: Color.fromCssColorString(
            point.id === activeSelectedWaypointId ? '#ffe8ca' : '#fff8ef',
          ),
          style: LabelStyle.FILL,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -22),
        },
      })

      viewer.entities.add({
        id: `${point.id}-ground-line`,
        polyline: {
          positions: [
            Cartesian3.fromDegrees(point.lng, point.lat, 0),
            Cartesian3.fromDegrees(point.lng, point.lat, point.altitude),
          ],
          width: point.id === activeSelectedWaypointId ? 3 : 2,
          material: color.withAlpha(point.id === activeSelectedWaypointId ? 0.8 : 0.55),
        },
      })

      if (point.id === activeSelectedWaypointId && point.role === 'waypoint') {
        const camera = getWaypointCamera(point)
        selectedWaypointOrigin = Cartesian3.fromDegrees(point.lng, point.lat, point.altitude)
        selectedWaypointRange = camera.range
        selectedWaypointOrientation = createFrustumOrientation(
          selectedWaypointOrigin,
          HeadingPitchRoll.fromDegrees(camera.heading, camera.pitch, camera.roll),
        )
      }
    })

    viewer.entities.add({
      id: 'route-line',
      polyline: {
        positions: points.map((point) =>
          Cartesian3.fromDegrees(point.lng, point.lat, point.altitude),
        ),
        width: 4,
        material: Color.fromCssColorString('#1f2937'),
      },
    })

    if (selectedWaypointOrigin && selectedWaypointOrientation) {
      const indicator = createFrustumDirectionIndicator({
        origin: selectedWaypointOrigin,
        orientation: selectedWaypointOrientation,
        length: selectedWaypointRange * 0.32,
      })

      viewer.entities.add({
        id: 'selected-waypoint-frustum-direction',
        polyline: {
          positions: indicator.positions,
          width: 7,
          arcType: ArcType.NONE,
          clampToGround: false,
          material: new PolylineArrowMaterialProperty(
            Color.fromCssColorString('#ef4444').withAlpha(0.95),
          ),
        },
      })
    }
  }, [activeSelectedWaypointId, points])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    if (frustumFillPrimitiveRef.current) {
      viewer.scene.primitives.remove(frustumFillPrimitiveRef.current)
      frustumFillPrimitiveRef.current = null
    }

    if (frustumOutlinePrimitiveRef.current) {
      viewer.scene.primitives.remove(frustumOutlinePrimitiveRef.current)
      frustumOutlinePrimitiveRef.current = null
    }

    if (!selectedWaypoint) return

    const camera = getWaypointCamera(selectedWaypoint)
    const origin = Cartesian3.fromDegrees(
      selectedWaypoint.lng,
      selectedWaypoint.lat,
      selectedWaypoint.altitude,
    )
    const frustum = new PerspectiveFrustum({
      fov: CesiumMath.toRadians(camera.fov),
      aspectRatio: camera.aspectRatio,
      near: 1,
      far: camera.range,
    })
    const orientation = createFrustumOrientation(
      origin,
      HeadingPitchRoll.fromDegrees(camera.heading, camera.pitch, camera.roll),
    )
    const display = createFrustumDisplay({ origin, orientation, frustum })

    const fillPrimitive = viewer.scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: display.fillInstance,
        appearance: display.fillAppearance,
      }),
    )

    const outlinePrimitive = viewer.scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: display.outlineInstance,
        appearance: display.outlineAppearance,
      }),
    )

    frustumFillPrimitiveRef.current = fillPrimitive
    frustumOutlinePrimitiveRef.current = outlinePrimitive

    return () => {
      if (viewer.isDestroyed()) return

      if (frustumFillPrimitiveRef.current === fillPrimitive) {
        viewer.scene.primitives.remove(fillPrimitive)
        frustumFillPrimitiveRef.current = null
      }

      if (frustumOutlinePrimitiveRef.current === outlinePrimitive) {
        viewer.scene.primitives.remove(outlinePrimitive)
        frustumOutlinePrimitiveRef.current = null
      }
    }
  }, [selectedWaypoint, viewerReady])

  function setPointCoordinate(id: string, field: 'lng' | 'lat', value: number) {
    setPoints((currentPoints) => updateMissionPoint(currentPoints, id, { [field]: value }))
  }

  function setPointAltitude(id: string, value: number) {
    setPoints((currentPoints) =>
      updateMissionPoint(currentPoints, id, { altitude: clampAltitude(value) }),
    )
  }

  function setWaypointCamera(id: string, field: keyof WaypointCamera, value: number) {
    setPoints((currentPoints) =>
      currentPoints.map((point) => {
        if (point.id !== id || point.role !== 'waypoint') return point

        return {
          ...point,
          camera: normalizeWaypointCamera({
            ...getWaypointCamera(point),
            [field]: value,
          }),
        }
      }),
    )
  }

  function addWaypointFromTemplate() {
    const previous = points.at(-2) ?? takeoffPoint
    const nextSequence = getNextWaypointSequence(points)
    const waypoint = createWaypoint(
      {
        lng: Number((previous.lng + 0.0012).toFixed(6)),
        lat: Number((previous.lat + 0.001).toFixed(6)),
      },
      nextSequence,
    )

    setPoints((currentPoints) => appendWaypoint(currentPoints, waypoint))
    setSelectedWaypointId(waypoint.id)
    setLastAction(`${waypoint.name} 已添加，可继续编辑经纬度或地图拾点`)
  }

  async function copyPayload() {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  function resetPlanner() {
    setPoints(DEFAULT_WAYPOINTS)
    setSelectedWaypointId(getInitialWaypointSelection(DEFAULT_WAYPOINTS))
    setMode('idle')
    setLastAction('已恢复默认多航点示例')
  }

  return (
    <main className="shell">
      <aside className="panel">
        <div className="panel__eyebrow">Cesium · UAV Route Planner</div>
        <h1>无人机多航点规划</h1>
        <p className="panel__intro">
          起飞点和返航点固定在首尾，中间可添加任意航点。点击“地图新增航点”后，在地图上点选即可插入到返航前。
        </p>

        <section className="card status-card">
          <div>
            <div className="card__label">当前模式</div>
            <div className={`mode-chip mode-chip--${mode}`}>
              {mode === 'idle' && '浏览地图'}
              {mode === 'pickTakeoff' && '点击地图设置起飞点'}
              {mode === 'pickWaypoint' && '点击地图新增航点'}
              {mode === 'pickReturn' && '点击地图设置返航点'}
            </div>
          </div>
          <p className="status-card__hint">{lastAction}</p>
          <div className="action-row">
            <button type="button" className="primary-button primary-button--compact" onClick={() => setMode('pickWaypoint')}>
              地图新增航点
            </button>
            <button type="button" className="ghost-button" onClick={addWaypointFromTemplate}>
              手动添加
            </button>
          </div>
        </section>

        <section className="card map-provider-card">
          <div className="section-head">
            <h2>天地图模式</h2>
            <span className="section-note">Web Mercator</span>
          </div>

          <label>
            <span>底图类型</span>
            <select
              value={tiandituMode}
              onChange={(event) => setTiandituMode(event.target.value as TiandituMapMode)}
            >
              <option value="vector">矢量地图 + 中文注记</option>
              <option value="imagery">影像地图 + 中文注记</option>
            </select>
          </label>

          <label>
            <span>天地图 tk</span>
            <input
              type="password"
              placeholder="填入天地图开发者 token"
              value={tiandituToken}
              onChange={(event) => setTiandituToken(event.target.value)}
            />
          </label>

          {!normalizedTiandituToken && (
            <p className="provider-warning">
              天地图服务需要 tk。可在这里临时填写，也可在 .env 中设置 VITE_TIANDITU_TOKEN。
            </p>
          )}
        </section>

        <section className="card">
          <div className="section-head">
            <h2>首尾点</h2>
            <span className="section-note">首尾不可删除</span>
          </div>

          {[takeoffPoint, returnPoint].map((point) => (
            <div className="endpoint-editor" key={point.id}>
              <div className="endpoint-editor__title">
                <span className={`route-badge route-badge--${point.role}`} />
                <strong>{point.name}</strong>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => setMode(point.role === 'takeoff' ? 'pickTakeoff' : 'pickReturn')}
                >
                  地图拾点
                </button>
              </div>
              <div className="field-grid field-grid--compact">
                <label>
                  <span>经度</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={point.lng}
                    onChange={(event) => setPointCoordinate(point.id, 'lng', Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>纬度</span>
                  <input
                    type="number"
                    step="0.000001"
                    value={point.lat}
                    onChange={(event) => setPointCoordinate(point.id, 'lat', Number(event.target.value))}
                  />
                </label>
              </div>
              <label>
                <span>{point.role === 'takeoff' ? '起飞高度（m）' : '返航高度（m）'}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={point.altitude}
                  onChange={(event) => setPointAltitude(point.id, Number(event.target.value))}
                />
              </label>
            </div>
          ))}
        </section>

        <section className="card waypoints-card">
          <div className="section-head">
            <h2>中间航点</h2>
            <span className="section-note">{waypointPoints.length} 个</span>
          </div>

          <div className="waypoint-list">
            {waypointPoints.length === 0 ? (
              <div className="empty-state">还没有中间航点。点击“地图新增航点”开始规划折线路线。</div>
            ) : (
              waypointPoints.map((point, index, waypointList) => {
                const camera = getWaypointCamera(point)

                return (
                  <article
                    className={`waypoint-item${point.id === activeSelectedWaypointId ? ' waypoint-item--selected' : ''}`}
                    key={point.id}
                    onClick={() => setSelectedWaypointId(point.id)}
                  >
                    <div className="waypoint-item__head">
                      <div>
                        <span className="waypoint-index">{index + 1}</span>
                        <strong>{point.name}</strong>
                      </div>
                      <div className="waypoint-actions">
                        <button
                          type="button"
                          className="mini-button"
                          disabled={index === 0}
                          onClick={(event) => {
                            event.stopPropagation()
                            setPoints((currentPoints) => reorderWaypoints(currentPoints, point.id, -1))
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="mini-button"
                          disabled={index === waypointList.length - 1}
                          onClick={(event) => {
                            event.stopPropagation()
                            setPoints((currentPoints) => reorderWaypoints(currentPoints, point.id, 1))
                          }}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="mini-button mini-button--danger"
                          onClick={(event) => {
                            event.stopPropagation()
                            setPoints((currentPoints) => removeWaypoint(currentPoints, point.id))
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    <div className="field-grid field-grid--compact">
                      <label>
                        <span>经度</span>
                        <input
                          type="number"
                          step="0.000001"
                          value={point.lng}
                          onChange={(event) => setPointCoordinate(point.id, 'lng', Number(event.target.value))}
                        />
                      </label>
                      <label>
                        <span>纬度</span>
                        <input
                          type="number"
                          step="0.000001"
                          value={point.lat}
                          onChange={(event) => setPointCoordinate(point.id, 'lat', Number(event.target.value))}
                        />
                      </label>
                    </div>
                    <label>
                      <span>巡航高度（m）</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={point.altitude}
                        onChange={(event) => setPointAltitude(point.id, Number(event.target.value))}
                      />
                    </label>

                    {point.id === activeSelectedWaypointId && (
                      <div className="camera-editor">
                        <div className="camera-editor__head">
                          <strong>云台视锥</strong>
                          <span className="section-note">地图中同步显示辅助视锥</span>
                        </div>
                        <div className="field-grid field-grid--compact">
                          <label>
                            <span>朝向 Heading（°）</span>
                            <input
                              type="number"
                              step="1"
                              value={camera.heading}
                              onChange={(event) => setWaypointCamera(point.id, 'heading', Number(event.target.value))}
                            />
                          </label>
                          <label>
                            <span>俯仰 Pitch（°）</span>
                            <input
                              type="number"
                              min="-89"
                              max="89"
                              step="1"
                              value={camera.pitch}
                              onChange={(event) => setWaypointCamera(point.id, 'pitch', Number(event.target.value))}
                            />
                          </label>
                        </div>
                        <div className="field-grid field-grid--compact">
                          <label>
                            <span>视场角 FOV（°）</span>
                            <input
                              type="number"
                              min="10"
                              max="120"
                              step="1"
                              value={camera.fov}
                              onChange={(event) => setWaypointCamera(point.id, 'fov', Number(event.target.value))}
                            />
                          </label>
                          <label>
                            <span>作用距离（m）</span>
                            <input
                              type="number"
                              min="20"
                              max="1000"
                              step="5"
                              value={camera.range}
                              onChange={(event) => setWaypointCamera(point.id, 'range', Number(event.target.value))}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })
            )}
          </div>
        </section>

        <section className="card metrics-card">
          <h2>航线概览</h2>
          <dl className="metrics-grid">
            <div>
              <dt>航段数</dt>
              <dd>{routeStats.legCount}</dd>
            </div>
            <div>
              <dt>水平总长</dt>
              <dd>{routeStats.totalHorizontalMeters} m</dd>
            </div>
            <div>
              <dt>空间总长</dt>
              <dd>{routeStats.totalDirectMeters} m</dd>
            </div>
            <div>
              <dt>最低高度</dt>
              <dd>{routeStats.minAltitude} m</dd>
            </div>
            <div>
              <dt>最高高度</dt>
              <dd>{routeStats.maxAltitude} m</dd>
            </div>
            <div>
              <dt>首尾高度差</dt>
              <dd>{routeStats.altitudeDelta} m</dd>
            </div>
          </dl>
        </section>

        <section className="card export-card">
          <div className="section-head">
            <h2>任务参数</h2>
            <button type="button" className="ghost-button" onClick={resetPlanner}>
              重置
            </button>
          </div>

          <pre>{JSON.stringify(payload, null, 2)}</pre>

          <button type="button" className="primary-button" onClick={copyPayload}>
            {copied ? '已复制 JSON' : '复制 JSON'}
          </button>
        </section>
      </aside>

      <section className="map-shell">
        <div ref={mapRef} className="map-canvas" />
        <div className="provider-pill">
          天地图 · {tiandituMode === 'vector' ? '矢量' : '影像'}
          {!normalizedTiandituToken && ' · 等待 tk'}
        </div>
        <div className="north-indicator" aria-label={describeNorthDirection(mapHeadingDegrees)}>
          <div className="north-indicator__arrow-wrap">
            <div
              className="north-indicator__arrow"
              style={{ transform: `rotate(${-mapHeadingDegrees}deg)` }}
            >
              ↑
            </div>
          </div>
          <div>
            <strong>正北</strong>
            <span>{formatMapHeading(mapHeadingDegrees)}</span>
          </div>
        </div>
        <div className="map-legend">
          <span><i className="dot dot--takeoff" />起飞点</span>
          <span><i className="dot dot--waypoint" />中间航点</span>
          <span><i className="dot dot--return" />返航点</span>
          <span><i className="dot dot--route" />规划航线</span>
        </div>
      </section>
    </main>
  )
}

export default App
