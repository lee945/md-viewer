import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirWatchers, FileWatcher } from '../src/main/services/watcher'

interface Created {
  path: string
  onChange: () => void
  closed: boolean
}

function makeFactory() {
  const created: Created[] = []
  const factory = (path: string, onChange: () => void) => {
    const record: Created = { path, onChange, closed: false }
    created.push(record)
    return {
      close: () => {
        record.closed = true
      }
    }
  }
  return { created, factory }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DirWatchers', () => {
  it('同一目录重复 add 只注册一个 watcher', () => {
    const { created, factory } = makeFactory()
    const watchers = new DirWatchers(factory, () => undefined)
    watchers.add('C:\\ws')
    watchers.add('C:\\ws')
    expect(created).toHaveLength(1)
    expect(watchers.has('C:\\ws')).toBe(true)
  })

  it('事件防抖：300ms 内多次事件只回调一次', () => {
    const { created, factory } = makeFactory()
    const changed: string[] = []
    const watchers = new DirWatchers(factory, (dir) => changed.push(dir))
    watchers.add('C:\\ws')

    created[0].onChange()
    vi.advanceTimersByTime(100)
    created[0].onChange()
    vi.advanceTimersByTime(100)
    created[0].onChange()
    expect(changed).toHaveLength(0)
    vi.advanceTimersByTime(300)
    expect(changed).toEqual(['C:\\ws'])
    vi.advanceTimersByTime(1000)
    expect(changed).toHaveLength(1)
  })

  it('不同目录的事件互不影响', () => {
    const { created, factory } = makeFactory()
    const changed: string[] = []
    const watchers = new DirWatchers(factory, (dir) => changed.push(dir))
    watchers.add('C:\\ws\\a')
    watchers.add('C:\\ws\\b')

    created[0].onChange()
    created[1].onChange()
    vi.advanceTimersByTime(300)
    expect(changed.sort()).toEqual(['C:\\ws\\a', 'C:\\ws\\b'])
  })

  it('clear 关闭全部 watcher 并取消未触发的防抖', () => {
    const { created, factory } = makeFactory()
    const changed: string[] = []
    const watchers = new DirWatchers(factory, (dir) => changed.push(dir))
    watchers.add('C:\\ws\\a')
    created[0].onChange()
    watchers.clear()
    expect(created[0].closed).toBe(true)
    vi.advanceTimersByTime(500)
    expect(changed).toHaveLength(0)
    expect(watchers.has('C:\\ws\\a')).toBe(false)
  })

  it('工厂抛错时不注册该目录', () => {
    const factory = () => {
      throw new Error('EPERM')
    }
    const watchers = new DirWatchers(factory, () => undefined)
    expect(() => watchers.add('C:\\locked')).not.toThrow()
    expect(watchers.has('C:\\locked')).toBe(false)
  })
})

describe('FileWatcher', () => {
  it('set 新路径会关闭旧监听并忽略旧事件', () => {
    const { created, factory } = makeFactory()
    const changed: string[] = []
    const watcher = new FileWatcher(factory, (path) => changed.push(path))
    watcher.set('C:\\a.md')
    watcher.set('C:\\b.md')

    expect(created[0].closed).toBe(true)
    expect(created).toHaveLength(2)

    created[0].onChange()
    vi.advanceTimersByTime(500)
    expect(changed).toHaveLength(0)

    created[1].onChange()
    vi.advanceTimersByTime(500)
    expect(changed).toEqual(['C:\\b.md'])
  })

  it('文件事件同样防抖', () => {
    const { created, factory } = makeFactory()
    const changed: string[] = []
    const watcher = new FileWatcher(factory, (path) => changed.push(path))
    watcher.set('C:\\a.md')

    created[0].onChange()
    created[0].onChange()
    vi.advanceTimersByTime(200)
    created[0].onChange()
    vi.advanceTimersByTime(300)
    expect(changed).toEqual(['C:\\a.md'])
  })

  it('clear 后不再回调', () => {
    const { created, factory } = makeFactory()
    const changed: string[] = []
    const watcher = new FileWatcher(factory, (path) => changed.push(path))
    watcher.set('C:\\a.md')
    created[0].onChange()
    watcher.clear()
    expect(created[0].closed).toBe(true)
    vi.advanceTimersByTime(500)
    expect(changed).toHaveLength(0)
  })
})
