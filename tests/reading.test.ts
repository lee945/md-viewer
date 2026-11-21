import { describe, expect, it } from 'vitest'
import { normalizeReading, READING_DEFAULTS } from '@shared/reading'

describe('normalizeReading', () => {
  it('非对象输入返回默认', () => {
    expect(normalizeReading(null)).toEqual(READING_DEFAULTS)
    expect(normalizeReading(undefined)).toEqual(READING_DEFAULTS)
    expect(normalizeReading('oops')).toEqual(READING_DEFAULTS)
  })

  it('逐字段回退：坏字号不影响合法宽度', () => {
    const result = normalizeReading({ fontSize: 999, contentWidth: 1100 })
    expect(result.fontSize).toBe(READING_DEFAULTS.fontSize)
    expect(result.contentWidth).toBe(1100)
  })

  it('未知字体回退默认，合法字体保留', () => {
    expect(normalizeReading({ fontFamily: 'comic' }).fontFamily).toBe('default')
    expect(normalizeReading({ fontFamily: 'serif' }).fontFamily).toBe('serif')
    expect(normalizeReading({ fontFamily: 'kai' }).fontFamily).toBe('kai')
  })

  it('contentWidth 允许 null（全宽）', () => {
    expect(normalizeReading({ contentWidth: null }).contentWidth).toBeNull()
    expect(normalizeReading({ contentWidth: 'wide' }).contentWidth).toBe(READING_DEFAULTS.contentWidth)
  })

  it('行距只接受预设档位', () => {
    expect(normalizeReading({ lineHeight: 3 }).lineHeight).toBe(READING_DEFAULTS.lineHeight)
    expect(normalizeReading({ lineHeight: 2 }).lineHeight).toBe(2)
  })

  it('默认值本身合法', () => {
    expect(normalizeReading(READING_DEFAULTS)).toEqual(READING_DEFAULTS)
  })
})
