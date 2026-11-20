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
