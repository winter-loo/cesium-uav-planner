export type TiandituMapMode = 'vector' | 'imagery'

export type TiandituLayerId = 'vec_w' | 'cva_w' | 'img_w' | 'cia_w'

export type TiandituLayerConfig = {
  id: TiandituLayerId
  label: string
  url: string
}

const TIANDITU_LABELS: Record<TiandituLayerId, string> = {
  vec_w: '天地图矢量底图',
  cva_w: '天地图矢量注记',
  img_w: '天地图影像底图',
  cia_w: '天地图影像注记',
}

const MODE_LAYER_IDS: Record<TiandituMapMode, TiandituLayerId[]> = {
  vector: ['vec_w', 'cva_w'],
  imagery: ['img_w', 'cia_w'],
}

export const TIANDITU_SUBDOMAINS = ['0', '1', '2', '3', '4', '5', '6', '7']

export function normalizeTiandituToken(token?: string) {
  return token?.trim() ?? ''
}

export function buildTiandituLayerUrl(layerId: TiandituLayerId, token: string) {
  return `https://t{s}.tianditu.gov.cn/DataServer?T=${layerId}&x={x}&y={y}&l={z}&tk=${encodeURIComponent(
    normalizeTiandituToken(token),
  )}`
}

export function getTiandituLayers(
  mode: TiandituMapMode,
  token: string,
): TiandituLayerConfig[] {
  return MODE_LAYER_IDS[mode].map((id) => ({
    id,
    label: TIANDITU_LABELS[id],
    url: buildTiandituLayerUrl(id, token),
  }))
}
