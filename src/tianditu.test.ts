import { describe, expect, it } from 'vitest'
import {
  buildTiandituLayerUrl,
  getTiandituLayers,
  normalizeTiandituToken,
  type TiandituMapMode,
} from './tianditu'

describe('tianditu helpers', () => {
  it('normalizes token by trimming whitespace', () => {
    expect(normalizeTiandituToken('  abc123  ')).toBe('abc123')
    expect(normalizeTiandituToken(undefined)).toBe('')
  })

  it('builds a web mercator vector layer URL with subdomains and token', () => {
    expect(buildTiandituLayerUrl('vec_w', 'TOKEN')).toBe(
      'https://t{s}.tianditu.gov.cn/DataServer?T=vec_w&x={x}&y={y}&l={z}&tk=TOKEN',
    )
  })

  it('returns vector base and annotation layers for vector mode', () => {
    expect(getTiandituLayers('vector', 'TOKEN')).toEqual([
      {
        id: 'vec_w',
        label: '天地图矢量底图',
        url: 'https://t{s}.tianditu.gov.cn/DataServer?T=vec_w&x={x}&y={y}&l={z}&tk=TOKEN',
      },
      {
        id: 'cva_w',
        label: '天地图矢量注记',
        url: 'https://t{s}.tianditu.gov.cn/DataServer?T=cva_w&x={x}&y={y}&l={z}&tk=TOKEN',
      },
    ])
  })

  it('returns imagery base and annotation layers for imagery mode', () => {
    const ids = getTiandituLayers('imagery' satisfies TiandituMapMode, 'TOKEN').map(
      (layer) => layer.id,
    )

    expect(ids).toEqual(['img_w', 'cia_w'])
  })
})
