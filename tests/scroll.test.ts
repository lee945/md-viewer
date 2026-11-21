import { describe, expect, it } from 'vitest'
import { parseScrollStore, upsertScroll } from '@renderer/stores/persist'
import type { ScrollRecord } from '@renderer/stores/persist'

describe('parseScrollStore', () => {
  it('损坏或空数据返回空表', () => {
    expect(parseScrollStore('{oops')).toEqual({})
    expect(parseScrollStore(null)).toEqual({})
    expect(parseScrollStore('[]')).toEqual({})
  })

  it('丢弃非法位置', () => {
    const raw = JSON.stringify({
      'a.md': { top: 12, t: 1 },
      'b.md': { top: -1, t: 2 },
      'c.md': { top: 'x', t: 3 },
      'd.md': null
    })
    expect(parseScrollStore(raw)).toEqual({ 'a.md': { top: 12, t: 1 } })
  })

  it('缺失时间戳补 0', () => {
    expect(parseScrollStore(JSON.stringify({ 'a.md': { top: 5 } }))).toEqual({
      'a.md': { top: 5, t: 0 }
    })
  })
})

describe('upsertScroll', () => {
  it('同路径（大小写/分隔符不同）覆盖为一条', () => {
    const store: Record<string, ScrollRecord> = { 'c:\\docs\\a.md': { top: 10, t: 1 } }
    const next = upsertScroll(store, 'C:/docs/A.md', 42, 5)
    expect(next['c:\\docs\\a.md']).toEqual({ top: 42, t: 5 })
    expect(Object.keys(next)).toHaveLength(1)
  })

  it('超过上限淘汰最旧', () => {
    let store: Record<string, ScrollRecord> = {}
    for (let i = 0; i < 205; i += 1) {
      store = upsertScroll(store, `f${i}.md`, i, i, 200)
    }
    expect(Object.keys(store)).toHaveLength(200)
    expect(store['f0.md']).toBeUndefined()
    expect(store['f4.md']).toBeUndefined()
    expect(store['f5.md']?.top).toBe(5)
    expect(store['f204.md']?.top).toBe(204)
  })

  it('非有限或负数位置不入库', () => {
    const store: Record<string, ScrollRecord> = { 'a.md': { top: 1, t: 1 } }
    expect(upsertScroll(store, 'b.md', Number.NaN)['b.md']).toBeUndefined()
    expect(upsertScroll(store, 'b.md', -5)['b.md']).toBeUndefined()
    expect(upsertScroll(store, 'b.md', Infinity)['b.md']).toBeUndefined()
  })

  it('不修改入参', () => {
    const store: Record<string, ScrollRecord> = { 'a.md': { top: 1, t: 1 } }
    const next = upsertScroll(store, 'b.md', 2, 2)
    expect(store).toEqual({ 'a.md': { top: 1, t: 1 } })
    expect(next).not.toBe(store)
  })
})
