import { create } from 'zustand'
import type { ColorScheme, FileInfo, FileOpenResult, RecentEntry } from '@shared/types'
import { isPathInside } from '@shared/paths'
import { normalizePreset, type ThemePreset } from '@shared/themes'
import {
  loadRecentFiles,
  loadRecentWorkspaces,
  loadWorkspace,
  pruneRecent,
  pushRecent,
  saveRecentFiles,
  saveRecentWorkspaces,
  saveWorkspace
} from './persist'

export interface OutlineItem {
  id: string
  level: number
  text: string
}

export type SidebarTab = 'outline' | 'files'

interface AppState {
  file: FileInfo | null
  workspaceRoot: string | null
  loading: boolean
  error: string | null
  theme: ColorScheme
  preset: ThemePreset
  outline: OutlineItem[]
  activeId: string | null
  sidebarTab: SidebarTab
  recentFiles: RecentEntry[]
  recentWorkspaces: RecentEntry[]
  bootstrap(): Promise<void>
  openDialog(): Promise<void>
  openPath(path: string): Promise<void>
  openWorkspaceDialog(): Promise<void>
  openWorkspace(path: string): Promise<void>
  openRecentFile(path: string): Promise<void>
  openRecentWorkspace(path: string): Promise<void>
  toggleTheme(): void
  setTheme(theme: ColorScheme): void
  setPreset(preset: ThemePreset): void
  setOutline(outline: OutlineItem[]): void
  setActiveId(id: string | null): void
  setSidebarTab(tab: SidebarTab): void
  clearError(): void
}

type SetState = (partial: Partial<AppState>) => void
type GetState = () => AppState

const THEME_KEY = 'mdv.theme'
const PRESET_KEY = 'mdv.theme-preset'
const SIDEBAR_TAB_KEY = 'mdv.sidebarTab'

let queue: Promise<void> = Promise.resolve()

/** 打开类操作串行执行，避免启动恢复、双击、第二实例互相覆盖 */
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task, task)
  return queue
}

function initialTheme(): ColorScheme {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function initialPreset(): ThemePreset {
  return normalizePreset(localStorage.getItem(PRESET_KEY))
}

function initialSidebarTab(): SidebarTab {
  return localStorage.getItem(SIDEBAR_TAB_KEY) === 'files' ? 'files' : 'outline'
}

function applyFile(get: GetState, set: SetState, data: FileOpenResult): void {
  const recentFiles = pushRecent(get().recentFiles, { path: data.file.path, time: Date.now() })
  saveRecentFiles(recentFiles)
  saveWorkspace(data.workspaceRoot)
  set({
    file: data.file,
    workspaceRoot: data.workspaceRoot,
    recentFiles,
    loading: false,
    outline: [],
    activeId: null
  })
}

function applyWorkspaceRoot(get: GetState, set: SetState, root: string): void {
  const recentWorkspaces = pushRecent(get().recentWorkspaces, { path: root, time: Date.now() })
  saveRecentWorkspaces(recentWorkspaces)
  saveWorkspace(root)
  const current = get()
  // 当前文件不再属于新工作区时清空预览
  const keepFile = current.file !== null && isPathInside(root, current.file.path)
  set({
    workspaceRoot: root,
    recentWorkspaces,
    loading: false,
    file: keepFile ? current.file : null,
    outline: keepFile ? current.outline : [],
    activeId: keepFile ? current.activeId : null
  })
}

export const useAppStore = create<AppState>((set, get) => ({
  file: null,
  workspaceRoot: null,
  loading: false,
  error: null,
  theme: initialTheme(),
  preset: initialPreset(),
  outline: [],
  activeId: null,
  sidebarTab: initialSidebarTab(),
  recentFiles: [],
  recentWorkspaces: [],

  async bootstrap() {
    set({ recentFiles: loadRecentFiles(), recentWorkspaces: loadRecentWorkspaces() })

    // 主进程是工作区根的唯一权威；持久化值只在主进程为空时用于恢复
    const current = await window.api.getWorkspace()
    if (!current.ok) {
      set({ error: current.error })
    } else if (current.data) {
      set({ workspaceRoot: current.data })
    } else {
      const saved = loadWorkspace()
      if (saved) {
        const result = await window.api.openWorkspace(saved)
        if (result.ok) {
          set({ workspaceRoot: result.data })
        } else {
          saveWorkspace(null)
          if (result.code !== 'ENOENT' && result.code !== 'ENOTDIR') set({ error: result.error })
        }
      }
    }

    const path = await window.api.takeStartupFile()
    if (path) await get().openPath(path)
  },

  async openDialog() {
    return enqueue(async () => {
      set({ loading: true, error: null })
      const result = await window.api.openFileDialog()
      if (!result.ok) {
        set({ loading: false, error: result.error })
        return
      }
      if (!result.data) {
        set({ loading: false })
        return
      }
      applyFile(get, set, result.data)
    })
  },

  async openPath(path) {
    return enqueue(async () => {
      set({ loading: true, error: null })
      const result = await window.api.openPath(path)
      if (!result.ok) {
        if (result.code === 'ENOENT' || result.code === 'ENOTDIR') {
          const recentFiles = pruneRecent(get().recentFiles, path)
          saveRecentFiles(recentFiles)
          set({ loading: false, error: result.error, recentFiles })
        } else {
          set({ loading: false, error: result.error })
        }
        return
      }
      applyFile(get, set, result.data)
    })
  },

  async openWorkspaceDialog() {
    return enqueue(async () => {
      set({ loading: true, error: null })
      const result = await window.api.openWorkspaceDialog()
      if (!result.ok) {
        set({ loading: false, error: result.error })
        return
      }
      if (!result.data) {
        set({ loading: false })
        return
      }
      applyWorkspaceRoot(get, set, result.data)
    })
  },

  async openWorkspace(path) {
    return enqueue(async () => {
      set({ loading: true, error: null })
      const result = await window.api.openWorkspace(path)
      if (!result.ok) {
        if (result.code === 'ENOENT' || result.code === 'ENOTDIR') {
          const recentWorkspaces = pruneRecent(get().recentWorkspaces, path)
          saveRecentWorkspaces(recentWorkspaces)
          set({ loading: false, error: result.error, recentWorkspaces })
        } else {
          set({ loading: false, error: result.error })
        }
        return
      }
      applyWorkspaceRoot(get, set, result.data)
    })
  },

  async openRecentFile(path) {
    await get().openPath(path)
  },

  async openRecentWorkspace(path) {
    await get().openWorkspace(path)
  },

  toggleTheme() {
    set((state) => {
      const theme: ColorScheme = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem(THEME_KEY, theme)
      return { theme }
    })
  },

  setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme)
    set({ theme })
  },

  setPreset(preset) {
    localStorage.setItem(PRESET_KEY, preset)
    set({ preset })
  },

  setOutline(outline) {
    set({ outline })
  },

  setActiveId(id) {
    set({ activeId: id })
  },

  setSidebarTab(tab) {
    localStorage.setItem(SIDEBAR_TAB_KEY, tab)
    set({ sidebarTab: tab })
  },

  clearError() {
    set({ error: null })
  }
}))
