import { useEffect, useLayoutEffect } from 'react'
import Sidebar from './components/Sidebar'
import Preview from './components/Preview'
import Welcome from './components/Welcome'
import { useAppStore } from './stores/app.store'
import { useReadingStore } from './stores/reading.store'
import { FONT_STACKS } from '@shared/reading'
import { paletteToVars, THEMES } from '@shared/themes'

export default function App() {
  const file = useAppStore((s) => s.file)
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const theme = useAppStore((s) => s.theme)
  const preset = useAppStore((s) => s.preset)
  const error = useAppStore((s) => s.error)
  const clearError = useAppStore((s) => s.clearError)
  const openDialog = useAppStore((s) => s.openDialog)
  const openPath = useAppStore((s) => s.openPath)
  const openWorkspaceDialog = useAppStore((s) => s.openWorkspaceDialog)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const reading = useReadingStore((s) => s.settings)

  useLayoutEffect(() => {
    const style = document.documentElement.style
    style.setProperty('--reading-font-size', `${reading.fontSize}px`)
    style.setProperty('--reading-font-family', FONT_STACKS[reading.fontFamily])
    style.setProperty('--reading-line-height', String(reading.lineHeight))
    style.setProperty(
      '--content-max-width',
      reading.contentWidth ? `${reading.contentWidth}px` : 'none'
    )
  }, [reading])

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset['theme'] = theme
    root.dataset['themePreset'] = preset
    for (const [name, value] of Object.entries(paletteToVars(THEMES[preset].scheme[theme]))) {
      root.style.setProperty(name, value)
    }
    window.api.setThemeSource(theme)
  }, [theme, preset])

  useEffect(() => {
    window.api.syncPrefs({ reading, theme, preset })
  }, [reading, theme, preset])

  useEffect(() => {
    const offReading = window.api.onMenuSetReading((patch) => {
      useReadingStore.getState().setReading(patch)
    })
    const offTheme = window.api.onMenuSetTheme((next) => {
      useAppStore.getState().setTheme(next)
    })
    const offPreset = window.api.onMenuSetPreset((next) => {
      useAppStore.getState().setPreset(next)
    })
    return () => {
      offReading()
      offTheme()
      offPreset()
    }
  }, [])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    const offOpen = window.api.onOpenFileFromMain((path) => {
      void openPath(path)
    })
    const offMenu = window.api.onMenuOpenFile(() => {
      void openDialog()
    })
    const offFolder = window.api.onMenuOpenFolder(() => {
      void openWorkspaceDialog()
    })
    return () => {
      offOpen()
      offMenu()
      offFolder()
    }
  }, [openPath, openDialog, openWorkspaceDialog])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void openDialog()
      }
    }
    const preventDefault = (event: DragEvent): void => {
      event.preventDefault()
    }
    const onDrop = (event: DragEvent): void => {
      event.preventDefault()
      const dropped = event.dataTransfer?.files?.[0]
      if (!dropped) return
      const path = window.api.getPathForFile(dropped)
      if (path) void openPath(path)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('dragover', preventDefault)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('dragover', preventDefault)
      window.removeEventListener('drop', onDrop)
    }
  }, [openDialog, openPath])

  return (
    <div className="app">
      <div className="app-body">
        {file || workspaceRoot ? (
          <>
            <Sidebar />
            {file ? <Preview /> : <Welcome />}
          </>
        ) : (
          <Welcome />
        )}
      </div>
      {error && (
        <div className="toast-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={clearError}>
            关闭
          </button>
        </div>
      )}
    </div>
  )
}
