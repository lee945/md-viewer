import { describe, expect, it } from 'vitest'
import { lineToTop, topToLine, type BlockRect } from '@renderer/markdown/scroll-map'

// 块 1 覆盖源码行 1-3（top 0，高 90）；块 2 覆盖行 6-8（top 150，高 90）；行 4-5 为块间空隙
const blocks: BlockRect[] = [
  { startLine: 1, endLine: 4, top: 0, height: 90 },
  { startLine: 6, endLine: 9, top: 150, height: 90 }
]

describe('lineToTop', () => {
  it('空数组返回 0', () => {
    expect(lineToTop([], 3)).toBe(0)
  })

  it('块首与块内按行比例插值', () => {
    expect(lineToTop(blocks, 1)).toBe(0)
    expect(lineToTop(blocks, 1.5)).toBeCloseTo(15)
    expect(lineToTop(blocks, 2.5)).toBeCloseTo(45)
  })

  it('块间空隙线性插值', () => {
    expect(lineToTop(blocks, 4)).toBeCloseTo(90)
    expect(lineToTop(blocks, 5)).toBeCloseTo(120)
    expect(lineToTop(blocks, 6)).toBeCloseTo(150)
  })

  it('越界钳制到首块顶与末块底', () => {
    expect(lineToTop(blocks, 0)).toBe(0)
    expect(lineToTop(blocks, 9)).toBe(240)
    expect(lineToTop(blocks, 100)).toBe(240)
  })
})

describe('topToLine', () => {
  it('空数组返回 1', () => {
    expect(topToLine([], 500)).toBe(1)
  })

  it('块内按像素比例插值', () => {
    expect(topToLine(blocks, 0)).toBe(1)
    expect(topToLine(blocks, 45)).toBeCloseTo(2.5)
    expect(topToLine(blocks, 200)).toBeCloseTo(7.667, 2)
  })

  it('块间空隙线性插值', () => {
    expect(topToLine(blocks, 90)).toBeCloseTo(4)
    expect(topToLine(blocks, 120)).toBeCloseTo(5)
    expect(topToLine(blocks, 150)).toBeCloseTo(6)
  })

  it('越界钳制到首块起始行与末块结束行', () => {
    expect(topToLine(blocks, -50)).toBe(1)
    expect(topToLine(blocks, 240)).toBe(9)
    expect(topToLine(blocks, 9999)).toBe(9)
  })
})
