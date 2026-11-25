import { create } from 'zustand'
import type {
  ColorScheme,
  FileInfo,
  FileOpenResult,
  ImageSaveMode,
  RecentEntry,
  ViewMode
} from '@shared/types'
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
  viewMode: ViewMode
  imageSaveMode: ImageSaveMode
  dirty: boolean
  savedContent: string | null
  saving: boolean
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
  setViewMode(mode: ViewMode): void
  setImageSaveMode(mode: ImageSaveMode): void
  setContent(content: string): void
  save(content: string): Promise<boolean>
  reloadFromDisk(): Promise<void>
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
const VIEW_MODE_KEY = 'mdv.viewMode'
const IMAGE_SAVE_KEY = 'mdv.image-save'

let queue: Promise<void> = Promise.resolve()

/** 打开类操作串行执行，避免启动恢复、双击、第二实例互相覆盖 */
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task, task)
  return queue
}

/** 编辑器是编辑态权威；打开/关闭走脏检查时从这里取最新内容 */
let contentGetter: (() => string | null) | null = null

export function registerContentGetter(getter: (() => string | null) | null): void {
  contentGetter = getter
}

/** 单栏编辑模式下大纲点击跳转由编辑器实现，分屏时回退到预览 DOM 滚动 */
let outlineJumper: ((id: string) => boolean) | null = null

export function registerOutlineJumper(jumper: ((id: string) => boolean) | null): void {
  outlineJumper = jumper
}

export function jumpToOutline(id: string): boolean {
  return outlineJumper?.(id) ?? false
}

function latestContent(state: AppState): string {
  return contentGetter?.() ?? state.file?.content ?? ''
}

async function confirmLoseChanges(get: GetState): Promise<boolean> {
  const state = get()
  if (!state.dirty || !state.file) return true
  const choice = await window.api.confirmDiscard()
  if (choice === 'cancel') return false
  if (choice === 'save') return get().save(latestContent(state))
  return true
}

function initialTheme(): ColorScheme {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function initialPreset(): ThemePreset {
  return normalizePreset(localStorage.getItem(PRESET_KEY))
}

function initialViewMode(): ViewMode {
  const saved = localStorage.getItem(VIEW_MODE_KEY)
  if (saved === 'ir' || saved === 'wysiwyg' || saved === 'split') return saved
  // 旧版本值迁移：阅读/单栏编辑统一落到即时渲染
  if (saved === 'read' || saved === 'edit') return 'ir'
  return 'ir'
}

function initialSidebarTab(): SidebarTab {
  return localStorage.getItem(SIDEBAR_TAB_KEY) === 'files' ? 'files' : 'outline'
}

function initialImageSaveMode(): ImageSaveMode {
  const saved = localStorage.getItem(IMAGE_SAVE_KEY)
  if (saved === 'assets' || saved === 'ask') return saved
  return 'doc'
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
    savedContent: data.file.content,
    dirty: false,
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
    savedContent: keepFile ? current.savedContent : null,
    dirty: keepFile ? current.dirty : false,
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
  viewMode: initialViewMode(),
  imageSaveMode: initialImageSaveMode(),
  dirty: false,
  savedContent: null,
  saving: false,
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
      if (!(await confirmLoseChanges(get))) return
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
      if (!(await confirmLoseChanges(get))) return
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
      if (!(await confirmLoseChanges(get))) return
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
      if (!(await confirmLoseChanges(get))) return
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

  setViewMode(mode) {
    localStorage.setItem(VIEW_MODE_KEY, mode)
    set({ viewMode: mode })
  },

  setImageSaveMode(mode) {
    localStorage.setItem(IMAGE_SAVE_KEY, mode)
    set({ imageSaveMode: mode })
  },

  setContent(content) {
    const { file, savedContent } = get()
    if (!file) return
    const dirty = content !== savedContent
    set({ file: { ...file, content }, dirty })
  },

  async save(content) {
    const state = get()
    const file = state.file
    if (!file || state.saving) return false
    set({ saving: true })
    const meta = { encoding: file.encoding, hasBOM: file.hasBOM, lineEnding: file.lineEnding }
    let result = await window.api.saveFile(file.path, content, meta, file.mtime)
    if (!result.ok && result.code === 'ECONFLICT') {
      const overwrite = await window.api.confirmOverwrite()
      if (!overwrite) {
        set({ saving: false })
        return false
      }
      const snapshot = await window.api.readFileSnapshot(file.path)
      result = await window.api.saveFile(
        file.path,
        content,
        meta,
        snapshot.ok ? snapshot.data.mtime : undefined
      )
    }
    if (!result.ok) {
      set({ saving: false, error: result.error })
      return false
    }
    const saved = result.data
    set({
      file: { ...saved, content },
      savedContent: content,
      dirty: false,
      saving: false
    })
    return true
  },

  async reloadFromDisk() {
    const file = get().file
    if (!file) return
    const result = await window.api.readFileSnapshot(file.path)
    if (!result.ok) {
      set({ error: result.error })
      return
    }
    set({ file: result.data, savedContent: result.data.content, dirty: false })
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
