import { describe, expect, it } from 'vitest'
import { baseName, isPathInside } from '@shared/paths'

describe('isPathInside', () => {
  it('根目录内的文件', () => {
    expect(isPathInside('C:\\docs', 'C:\\docs\\a.md')).toBe(true)
    expect(isPathInside('C:\\docs', 'C:\\docs\\sub\\a.md')).toBe(true)
  })

  it('相同路径视为在内部', () => {
    expect(isPathInside('C:\\docs', 'C:\\docs')).toBe(true)
  })

  it('前缀相似的兄弟目录不算', () => {
    expect(isPathInside('C:\\docs', 'C:\\docs2\\a.md')).toBe(false)
  })

  it('大小写不敏感', () => {
    expect(isPathInside('c:\\Docs', 'C:\\docs\\A.MD')).toBe(true)
  })

  it('折叠 .. 后越界或仍在内部', () => {
    expect(isPathInside('C:\\docs', 'C:\\docs\\..\\evil.md')).toBe(false)
    expect(isPathInside('C:\\docs', 'C:\\docs\\sub\\..\\ok.md')).toBe(true)
  })

  it('盘符根', () => {
    expect(isPathInside('C:\\', 'C:\\anything.md')).toBe(true)
    expect(isPathInside('C:\\', 'D:\\anything.md')).toBe(false)
  })
})

describe('baseName', () => {
  it('取路径末段', () => {
    expect(baseName('C:\\docs\\a.md')).toBe('a.md')
    expect(baseName('C:\\docs\\')).toBe('docs')
  })
})
