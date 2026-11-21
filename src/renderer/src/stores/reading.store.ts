import { create } from 'zustand'
import type { ReadingSettings } from '@shared/types'
import { normalizeReading, READING_DEFAULTS } from '@shared/reading'

const READING_KEY = 'mdv.reading'

export function loadReading(): ReadingSettings {
  const raw = localStorage.getItem(READING_KEY)
  if (!raw) return READING_DEFAULTS
  try {
    return normalizeReading(JSON.parse(raw))
  } catch {
    return READING_DEFAULTS
  }
}

function saveReading(settings: ReadingSettings): void {
  try {
    localStorage.setItem(READING_KEY, JSON.stringify(settings))
  } catch {
    // 存储不可用时仅内存生效
  }
}

interface ReadingState {
  settings: ReadingSettings
  setReading(patch: Partial<ReadingSettings>): void
  resetReading(): void
}

export const useReadingStore = create<ReadingState>((set, get) => ({
  settings: loadReading(),

  setReading(patch) {
    const settings = normalizeReading({ ...get().settings, ...patch })
    saveReading(settings)
    set({ settings })
  },

  resetReading() {
    saveReading(READING_DEFAULTS)
    set({ settings: READING_DEFAULTS })
  }
}))
