export type WatchFactory = (path: string, onChange: () => void) => { close(): void }

interface Waiter {
  watcher: { close(): void }
  timer: ReturnType<typeof setTimeout> | null
}

export const WATCH_DEBOUNCE_MS = 300

/** 目录监听：按路径去重，事件 300ms 防抖后回调 */
export class DirWatchers {
  private readonly entries = new Map<string, Waiter>()

  constructor(
    private readonly factory: WatchFactory,
    private readonly onChanged: (dir: string) => void,
    private readonly debounceMs: number = WATCH_DEBOUNCE_MS
  ) {}

  add(dir: string): void {
    if (this.entries.has(dir)) return
    const entry: Waiter = { watcher: { close: () => undefined }, timer: null }
    try {
      entry.watcher = this.factory(dir, () => this.schedule(dir, entry))
    } catch {
      // 目录已不可监听（如已被删除），保持未注册状态
      return
    }
    this.entries.set(dir, entry)
  }

  has(dir: string): boolean {
    return this.entries.has(dir)
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      if (entry.timer) clearTimeout(entry.timer)
      entry.watcher.close()
    }
    this.entries.clear()
  }

  private schedule(dir: string, entry: Waiter): void {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = null
      if (this.entries.get(dir) === entry) this.onChanged(dir)
    }, this.debounceMs)
  }
}

/** 当前文件监听：set 会替换旧监听，避免 rename 后残留死 watcher */
export class FileWatcher {
  private current: { path: string; watcher: { close(): void } } | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly factory: WatchFactory,
    private readonly onChanged: (path: string) => void,
    private readonly debounceMs: number = WATCH_DEBOUNCE_MS
  ) {}

  set(path: string): void {
    this.clear()
    const watcher = this.factory(path, () => {
      if (this.current?.path !== path) return
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        if (this.current?.path === path) this.onChanged(path)
      }, this.debounceMs)
    })
    this.current = { path, watcher }
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.current?.watcher.close()
    this.current = null
  }
}
