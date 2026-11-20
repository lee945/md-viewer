import { describe, expect, it } from 'vitest'
import { pruneRecent, pushRecent } from '@renderer/stores/persist'
import type { RecentEntry } from '@shared/types'

const entry = (path: string, time = 0): RecentEntry => ({ path, time })

describe('pushRecent', () => {
  it('新条目进入队首', () => {
    const list = pushRecent([entry('a.md', 1)], entry('b.md', 2))
    expect(list.map((item) => item.path)).toEqual(['b.md', 'a.md'])
  })

  it('同路径去重并移到队首（大小写与分隔符不敏感）', () => {
    const list = pushRecent(
      [entry('a.md', 1), entry('C:\\docs\\A.md', 2)],
      entry('c:/docs/a.md', 3)
    )
    expect(list.map((item) => item.time)).toEqual([3, 1])
  })

  it('超过上限截断', () => {
    let list: RecentEntry[] = []
    for (let i = 0; i < 12; i += 1) list = pushRecent(list, entry(`f${i}.md`, i))
    expect(list).toHaveLength(10)
    expect(list[0]?.path).toBe('f11.md')
  })

  it('不修改入参', () => {
    const original = [entry('a.md', 1)]
    pushRecent(original, entry('b.md', 2))
    expect(original).toHaveLength(1)
  })
})

describe('pruneRecent', () => {
  it('剔除大小写、分隔符不同的同一路径', () => {
    expect(pruneRecent([entry('C:\\Docs\\a.md'), entry('b.md')], 'c:/docs/A.md')).toEqual([
      entry('b.md')
    ])
  })
})
