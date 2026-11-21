import { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { useAppStore } from '@renderer/stores/app.store'
import { samePath } from '@renderer/stores/persist'
import { createEditorState, type EditorHandlers } from './setup'

const CONTENT_DEBOUNCE_MS = 150

interface Props {
  onReady(view: EditorView | null): void
  onContent(doc: string): void
  onSave(doc: string): void
}

export default function EditorPane({ onReady, onContent, onSave }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const pathRef = useRef<string | null>(null)
  const externalRef = useRef(false)
  const timerRef = useRef(0)
  const handlersRef = useRef({ onContent, onSave })
  handlersRef.current = { onContent, onSave }
  const filePath = useAppStore((s) => s.file?.path ?? null)
  const fileContent = useAppStore((s) => s.file?.content ?? null)

  const makeHandlers = (): EditorHandlers => ({
    onChange: (doc) => {
      if (externalRef.current) return
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = 0
        handlersRef.current.onContent(doc)
      }, CONTENT_DEBOUNCE_MS)
    },
    onSave: (doc) => handlersRef.current.onSave(doc)
  })

  const flushPending = (): void => {
    if (!timerRef.current) return
    window.clearTimeout(timerRef.current)
    timerRef.current = 0
    const view = viewRef.current
    if (view) handlersRef.current.onContent(view.state.doc.toString())
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const initial = useAppStore.getState().file
    const view = new EditorView({
      state: createEditorState(initial?.content ?? '', makeHandlers()),
      parent: host
    })
    viewRef.current = view
    pathRef.current = initial?.path ?? null
    onReady(view)
    return () => {
      flushPending()
      onReady(null)
      viewRef.current = null
      view.destroy()
    }
    // 编辑器只在首次挂载时创建，回调通过 ref 读取最新值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReady])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !filePath) return
    if (pathRef.current && samePath(pathRef.current, filePath)) return
    flushPending()
    pathRef.current = filePath
    externalRef.current = true
    view.setState(createEditorState(useAppStore.getState().file?.content ?? '', makeHandlers()))
    externalRef.current = false
    view.scrollDOM.scrollTop = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !filePath || fileContent === null) return
    if (!pathRef.current || !samePath(pathRef.current, filePath)) return
    if (view.composing) return
    const current = view.state.doc.toString()
    if (current === fileContent) return
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = 0
    }
    externalRef.current = true
    view.dispatch({ changes: { from: 0, to: current.length, insert: fileContent } })
    externalRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, fileContent])

  return <div className="editor-pane" ref={hostRef} />
}
