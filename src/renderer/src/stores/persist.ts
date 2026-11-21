import type { RecentEntry } from '@shared/types'

const RECENT_FILES_KEY = 'mdv.recentFiles'
const RECENT_WORKSPACES_KEY = 'mdv.recentWorkspaces'
const WORKSPACE_KEY = 'mdv.workspace'
const RECENT_LIMIT = 10

function parseList(raw: string | null): RecentEntry[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter(
      (item): item is RecentEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as RecentEntry).path === 'string' &&
        (item as RecentEntry).path.length > 0 &&
        typeof (item as RecentEntry).time === 'number'
    )
  } catch {
    return []
  }
}

export function samePath(a: string, b: string): boolean {
  return a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()
}

/** 同路径去重、移到队首、截断上限（返回新数组，不改入参） */
export function pushRecent(
  list: RecentEntry[],
  entry: RecentEntry,
  limit = RECENT_LIMIT
): RecentEntry[] {
  const rest = list.filter((item) => !samePath(item.path, entry.path))
  return [entry, ...rest].slice(0, limit)
}

export function loadRecentFiles(): RecentEntry[] {
  return parseList(localStorage.getItem(RECENT_FILES_KEY))
}

export function loadRecentWorkspaces(): RecentEntry[] {
  return parseList(localStorage.getItem(RECENT_WORKSPACES_KEY))
}

export function saveRecentFiles(list: RecentEntry[]): void {
  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(list))
}

export function saveRecentWorkspaces(list: RecentEntry[]): void {
  localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(list))
}

/** 打开失败且路径已失效时，从最近列表剔除该条 */
export function pruneRecent(list: RecentEntry[], path: string): RecentEntry[] {
  return list.filter((item) => !samePath(item.path, path))
}

export function loadWorkspace(): string | null {
  return localStorage.getItem(WORKSPACE_KEY) || null
}

export function saveWorkspace(path: string | null): void {
  if (path) localStorage.setItem(WORKSPACE_KEY, path)
  else localStorage.removeItem(WORKSPACE_KEY)
}

const SCROLLS_KEY = 'mdv.scrolls'
const SCROLL_LIMIT = 200

export interface ScrollRecord {
  top: number
  t: number
}

function pathKey(filePath: string): string {
  return filePath.replace(/\//g, '\\').toLowerCase()
}

/** 损坏 JSON 返回空表；丢弃非有限或负数的位置 */
export function parseScrollStore(raw: string | null): Record<string, ScrollRecord> {
  if (!raw) return {}
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {}
    const store: Record<string, ScrollRecord> = {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue
      const { top, t } = value as Partial<ScrollRecord>
      if (typeof top !== 'number' || !Number.isFinite(top) || top < 0) continue
      store[key] = { top, t: typeof t === 'number' && Number.isFinite(t) ? t : 0 }
    }
    return store
  } catch {
    return {}
  }
}

/** 同路径覆盖、按时间淘汰最旧（返回新对象，不改入参） */
export function upsertScroll(
  store: Record<string, ScrollRecord>,
  filePath: string,
  top: number,
  now = Date.now(),
  limit = SCROLL_LIMIT
): Record<string, ScrollRecord> {
  if (!Number.isFinite(top) || top < 0) return { ...store }
  const key = pathKey(filePath)
  const entries = Object.entries(store).filter(([existing]) => existing !== key)
  entries.push([key, { top, t: now }])
  entries.sort((a, b) => b[1].t - a[1].t)
  return Object.fromEntries(entries.slice(0, limit))
}

export function loadScrollPosition(filePath: string): number {
  return parseScrollStore(localStorage.getItem(SCROLLS_KEY))[pathKey(filePath)]?.top ?? 0
}

export function saveScrollPosition(filePath: string, top: number): void {
  try {
    const store = parseScrollStore(localStorage.getItem(SCROLLS_KEY))
    localStorage.setItem(SCROLLS_KEY, JSON.stringify(upsertScroll(store, filePath, top)))
  } catch {
    // 滚动中高频写入，存储失败时静默忽略
  }
}
