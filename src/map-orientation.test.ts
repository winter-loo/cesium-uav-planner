import { describe, expect, it } from 'vitest'
import {
  describeNorthDirection,
  formatMapHeading,
  normalizeHeadingDegrees,
} from './map-orientation'

describe('map orientation helpers', () => {
  it('normalizes heading degrees into a 0-359 range', () => {
    expect(normalizeHeadingDegrees(0)).toBe(0)
    expect(normalizeHeadingDegrees(361)).toBe(1)
    expect(normalizeHeadingDegrees(-90)).toBe(270)
  })

  it('formats map heading as the screen direction that north points to', () => {
    expect(formatMapHeading(0)).toBe('上方 0°')
    expect(formatMapHeading(90)).toBe('左侧 90°')
    expect(formatMapHeading(180)).toBe('下方 180°')
    expect(formatMapHeading(270)).toBe('右侧 270°')
  })

  it('provides a concise chinese description for north direction', () => {
    expect(describeNorthDirection(0)).toBe('正北朝屏幕上方')
    expect(describeNorthDirection(90)).toBe('正北朝屏幕左侧')
  })
})
