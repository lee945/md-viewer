import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { useAppStore, registerContentGetter } from './stores/app.store'
import { useReadingStore } from './stores/reading.store'
import { samePath } from './stores/persist'
import Sidebar from './components/Sidebar'
import Preview from './components/Preview'
import SplitLayout from './components/SplitLayout'
import Welcome from './components/Welcome'
import EditorPane from './editor/EditorPane'
import { FONT_STACKS } from '@shared/reading'
import { paletteToVars, THEMES } from '@shared/themes'

export default function App() {
  const file = useAppStore((s) => s.file)
  const workspaceRoot = useAppStore((s) => s.workspaceRoot)
  const theme = useAppStore((s) => s.theme)
  const preset = useAppStore((s) => s.preset)
  const viewMode = useAppStore((s) => s.viewMode)
  const dirty = useAppStore((s) => s.dirty)
  const error = useAppStore((s) => s.error)
  const clearError = useAppStore((s) => s.clearError)
  const openDialog = useAppStore((s) => s.openDialog)
  const openPath = useAppStore((s) => s.openPath)
  const openWorkspaceDialog = useAppStore((s) => s.openWorkspaceDialog)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const reading = useReadingStore((s) => s.settings)
  const [external, setExternal] = useState<{ path: string; deleted: boolean } | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)

  const handleEditorReady = useCallback((view: EditorView | null) => {
    editorViewRef.current = view
  }, [editorViewRef])

  const getEditorView = useCallback(() => editorViewRef.current, [editorViewRef])

  const saveNow = useCallback(async (doc?: string) => {
    const state = useAppStore.getState()
    if (!state.file) return false
    const content = doc ?? editorViewRef.current?.state.doc.toString() ?? state.file.content
    return state.save(content)
  }, [])

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
    window.api.syncPrefs({ reading, theme, preset, viewMode })
  }, [reading, theme, preset, viewMode])

  useEffect(() => {
    window.api.setDirty(dirty)
  }, [dirty])

  useEffect(() => {
    registerContentGetter(() => editorViewRef.current?.state.doc.toString() ?? null)
    return () => registerContentGetter(null)
  }, [])

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
    const offSave = window.api.onMenuSaveFile(() => {
      void saveNow()
    })
    const offMode = window.api.onMenuSetViewMode((mode) => {
      useAppStore.getState().setViewMode(mode)
    })
    const offSaveClose = window.api.onRequestSaveAndClose(() => {
      void saveNow().then((ok) => {
        if (ok) window.api.closeConfirmed()
      })
    })
    return () => {
      offReading()
      offTheme()
      offPreset()
      offSave()
      offMode()
      offSaveClose()
    }
  }, [saveNow])

  useEffect(() => {
    setExternal(null)
  }, [file])

  useEffect(() => {
    const off = window.api.onFileChanged((path) => {
      void window.api.readFileSnapshot(path).then((result) => {
        const latest = useAppStore.getState().file
        if (!latest || !samePath(path, latest.path)) return
        if (!result.ok) {
          if (result.code === 'ENOENT') setExternal({ path, deleted: true })
          return
        }
        if (result.data.content !== latest.content) setExternal({ path, deleted: false })
      })
    })
    return off
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
        return
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveNow()
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
  }, [openDialog, openPath, saveNow])

  return (
    <div className="app">
      <div className="app-body">
        {file || workspaceRoot ? (
          <>
            <Sidebar />
            {file ? (
              <SplitLayout
                editor={
                  <EditorPane
                    onReady={handleEditorReady}
                    onContent={(doc) => useAppStore.getState().setContent(doc)}
                    onSave={(doc) => {
                      void saveNow(doc)
                    }}
                  />
                }
                preview={<Preview getEditorView={getEditorView} />}
              />
            ) : (
              <Welcome />
            )}
          </>
        ) : (
          <Welcome />
        )}
      </div>
      {external && (
        <div className="external-banner" role="status">
          <span>{external.deleted ? '文件已被删除或移动' : '文件已在外部修改'}</span>
          {!external.deleted && (
            <button
              type="button"
              onClick={() => {
                const target = external.path
                setExternal(null)
                void openPath(target)
              }}
            >
              重新加载
            </button>
          )}
          <button type="button" onClick={() => setExternal(null)}>
            忽略
          </button>
        </div>
      )}
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
