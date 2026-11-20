import { create } from 'zustand'
import type { ColorScheme, FileInfo } from '@shared/types'

export interface OutlineItem {
  id: string
  level: number
  text: string
}

interface AppState {
  file: FileInfo | null
  loading: boolean
  error: string | null
  theme: ColorScheme
  outline: OutlineItem[]
  activeId: string | null
  openDialog(): Promise<void>
  openPath(path: string): Promise<void>
  toggleTheme(): void
  setTheme(theme: ColorScheme): void
  setOutline(outline: OutlineItem[]): void
  setActiveId(id: string | null): void
  clearError(): void
}

const THEME_KEY = 'mdv.theme'

function initialTheme(): ColorScheme {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useAppStore = create<AppState>((set) => ({
  file: null,
  loading: false,
  error: null,
  theme: initialTheme(),
  outline: [],
  activeId: null,

  async openDialog() {
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
    set({ file: result.data, loading: false, outline: [], activeId: null })
  },

  async openPath(path) {
    set({ loading: true, error: null })
    const result = await window.api.openPath(path)
    if (!result.ok) {
      set({ loading: false, error: result.error })
      return
    }
    set({ file: result.data, loading: false, outline: [], activeId: null })
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

  setOutline(outline) {
    set({ outline })
  },

  setActiveId(id) {
    set({ activeId: id })
  },

  clearError() {
    set({ error: null })
  }
}))
