import { useEffect } from 'react'
import Toolbar from './components/Toolbar'
import Outline from './components/Outline'
import Preview from './components/Preview'
import Welcome from './components/Welcome'
import { useAppStore } from './stores/app.store'

export default function App() {
  const file = useAppStore((s) => s.file)
  const theme = useAppStore((s) => s.theme)
  const error = useAppStore((s) => s.error)
  const clearError = useAppStore((s) => s.clearError)
  const openDialog = useAppStore((s) => s.openDialog)
  const openPath = useAppStore((s) => s.openPath)

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    window.api.setThemeSource(theme)
  }, [theme])

  useEffect(() => {
    let disposed = false
    void window.api.takeStartupFile().then((path) => {
      if (path && !disposed) void openPath(path)
    })
    const offOpen = window.api.onOpenFileFromMain((path) => {
      void openPath(path)
    })
    const offMenu = window.api.onMenuOpenFile(() => {
      void openDialog()
    })
    return () => {
      disposed = true
      offOpen()
      offMenu()
    }
  }, [openPath, openDialog])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
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
      <Toolbar />
      <div className="app-body">
        {file ? (
          <>
            <Outline />
            <Preview />
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
