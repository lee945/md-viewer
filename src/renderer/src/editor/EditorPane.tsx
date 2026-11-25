import { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import {
  registerOutlineJumper,
  useAppStore,
  type OutlineItem
} from '@renderer/stores/app.store'
import { samePath } from '@renderer/stores/persist'
import { uniqueHeadingId } from '@renderer/markdown/slug'
import { resolveRelative } from '@renderer/markdown/paths'
import {
  createEditorState,
  livePreviewCompartment,
  livePreviewFor,
  type EditorHandlers,
  type EditorOptions
} from './setup'

const CONTENT_DEBOUNCE_MS = 150

interface Props {
  onReady(view: EditorView | null): void
  onContent(doc: string): void
  onSave(doc: string): void
}

interface HeadingPos {
  id: string
  from: number
}

function headingText(view: EditorView, name: string, from: number): string {
  const line = view.state.doc.lineAt(from)
  let text = line.text
  if (name.startsWith('ATX')) {
    text = text.replace(/^\s{0,3}#{1,6}\s*/, '').replace(/\s+#+\s*$/, '')
  }
  return text.replace(/[*_`~[\]]/g, '').trim()
}

function buildOutline(view: EditorView): { items: OutlineItem[]; positions: HeadingPos[] } {
  const items: OutlineItem[] = []
  const positions: HeadingPos[] = []
  const used = new Map<string, number>()
  // 冷启动时语法树可能尚未完整解析，先强制解析整篇
  const tree = ensureSyntaxTree(view.state, view.state.doc.length, 500) ?? syntaxTree(view.state)
  tree.iterate({
    enter: (node) => {
      const match = /^(?:ATXHeading|SetextHeading)([1-6])$/.exec(node.name)
      if (!match) return
      const text = headingText(view, node.name, node.from)
      const id = uniqueHeadingId(used, text)
      items.push({ id, level: Number(match[1]), text })
      positions.push({ id, from: node.from })
    }
  })
  return { items, positions }
}

export default function EditorPane({ onReady, onContent, onSave }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const pathRef = useRef<string | null>(null)
  const externalRef = useRef(false)
  const timerRef = useRef(0)
  const headingsRef = useRef<HeadingPos[]>([])
  const handlersRef = useRef({ onContent, onSave })
  handlersRef.current = { onContent, onSave }
  const filePath = useAppStore((s) => s.file?.path ?? null)
  const fileContent = useAppStore((s) => s.file?.content ?? null)
  const viewMode = useAppStore((s) => s.viewMode)
  const preset = useAppStore((s) => s.preset)
  const scheme = useAppStore((s) => s.theme)
  const setOutline = useAppStore((s) => s.setOutline)
  const setActiveId = useAppStore((s) => s.setActiveId)

  const editorOptions = (): EditorOptions => ({
    viewMode: useAppStore.getState().viewMode,
    getDocPath: () => pathRef.current,
    getTheme: () => {
      const state = useAppStore.getState()
      return { preset: state.preset, scheme: state.theme }
    }
  })

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
      state: createEditorState(initial?.content ?? '', makeHandlers(), editorOptions()),
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
    view.setState(createEditorState(useAppStore.getState().file?.content ?? '', makeHandlers(), editorOptions()))
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

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: livePreviewCompartment.reconfigure(livePreviewFor(editorOptions()))
    })
    view.requestMeasure()
  }, [viewMode, preset, scheme])

  useEffect(() => {
    if (!filePath || viewMode === 'split') return
    // 单栏渲染模式下由编辑器提供大纲与活动标题（分屏时由预览 DOM 提供）
    let scrollRaf = 0
    let buildRaf = 0
    let retries = 0
    let viewRetries = 0
    let scrollEl: HTMLElement | null = null

    const updateActive = (): void => {
      const view = viewRef.current
      if (!view) return
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 24)
      let current: string | null = null
      for (const heading of headingsRef.current) {
        if (heading.from <= block.from) current = heading.id
        else break
      }
      setActiveId(current ?? headingsRef.current[0]?.id ?? null)
    }

    const rebuild = (): boolean => {
      const view = viewRef.current
      if (!view) return false
      const result = buildOutline(view)
      headingsRef.current = result.positions
      setOutline(result.items)
      updateActive()
      return result.items.length > 0
    }

    const onScroll = (): void => {
      if (!scrollRaf) scrollRaf = requestAnimationFrame(updateActive)
    }

    // 语法树可能尚未完整解析：逐帧补建直到拿到标题（或确认文档无标题）
    const ensure = (): void => {
      const view = viewRef.current
      if (!view || retries >= 12) return
      if (headingsRef.current.length === 0 && view.state.doc.length > 0) {
        retries++
        if (!rebuild()) buildRaf = requestAnimationFrame(ensure)
      }
    }

    const attach = (): void => {
      const view = viewRef.current
      if (!view) {
        if (viewRetries++ < 12) buildRaf = requestAnimationFrame(attach)
        return
      }
      scrollEl = view.scrollDOM
      scrollEl.addEventListener('scroll', onScroll, { passive: true })
      rebuild()
      buildRaf = requestAnimationFrame(ensure)
    }

    attach()
    return () => {
      if (scrollEl) scrollEl.removeEventListener('scroll', onScroll)
      if (scrollRaf) cancelAnimationFrame(scrollRaf)
      if (buildRaf) cancelAnimationFrame(buildRaf)
    }
  }, [filePath, fileContent, viewMode, setOutline, setActiveId])

  useEffect(() => {
    registerOutlineJumper((id) => {
      const view = viewRef.current
      if (!view) return false
      const heading = headingsRef.current.find((item) => item.id === id)
      if (!heading) return false
      view.dispatch({
        selection: { anchor: heading.from },
        effects: EditorView.scrollIntoView(heading.from, { y: 'start', yMargin: 8 })
      })
      view.focus()
      return true
    })
    return () => registerOutlineJumper(null)
  }, [])

  // 就地渲染模式下点击链接：内部锚点跳到标题，外链交给系统浏览器，相对 md 在应用内打开
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const hrefOf = (node: SyntaxNode): string | null => {
      const doc = view.state.doc
      if (node.name === 'Autolink') {
        return doc.sliceString(node.from, node.to).replace(/^</, '').replace(/>$/, '')
      }
      if (node.name === 'URL') return doc.sliceString(node.from, node.to)
      const url = node.getChild('URL')
      return url ? doc.sliceString(url.from, url.to) : null
    }
    const openLink = (href: string): void => {
      if (href.startsWith('#')) {
        const id = decodeURIComponent(href.slice(1))
        const heading = headingsRef.current.find((item) => item.id === id)
        if (!heading) return
        view.dispatch({
          selection: { anchor: heading.from },
          effects: EditorView.scrollIntoView(heading.from, { y: 'start', yMargin: 8 })
        })
        view.focus()
        return
      }
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        window.api.openExternal(href)
        return
      }
      const current = pathRef.current
      if (current && /\.(md|markdown|mdown|mkd|txt)(#.*)?$/i.test(href)) {
        const target = resolveRelative(current, href)
        if (target) void useAppStore.getState().openPath(target)
      }
    }
    const onClick = (event: MouseEvent): void => {
      if (event.button !== 0) return
      // 仅 Ctrl/Cmd+左键触发跳转，普通点击保持定位光标
      if (!event.ctrlKey && !event.metaKey) return
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos == null) return
      let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1)
      while (node && node.name !== 'Link' && node.name !== 'Autolink' && node.name !== 'URL') {
        node = node.parent
      }
      // Link 内部的 URL 子节点走 Link 分支，避免重复处理
      if (node?.name === 'URL' && node.parent?.name === 'Link') node = node.parent
      if (!node) return
      const href = hrefOf(node)
      if (!href) return
      event.preventDefault()
      event.stopPropagation()
      openLink(href)
    }
    view.contentDOM.addEventListener('click', onClick, true)
    return () => view.contentDOM.removeEventListener('click', onClick, true)
  }, [filePath])

  // 图片入稿：拖拽或粘贴图片时保存到 assets/，在落点插入 Markdown 图片语法
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const isImage = (file: File): boolean =>
      file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(file.name)
    const insertImages = (files: File[], pos: number): void => {
      const current = pathRef.current
      if (!current || files.length === 0) return
      void (async () => {
        const links: string[] = []
        for (const file of files) {
          // 来自资源管理器的文件有真实路径，直接复制；剪贴板截图等无路径，改传字节
          const src = window.api.getPathForFile(file)
          const result = src
            ? await window.api.copyImageToAssets(src, current)
            : await window.api.saveImageBuffer(
                new Uint8Array(await file.arrayBuffer()),
                file.type,
                current
              )
          if (result.ok) links.push(`![](${result.data})`)
        }
        if (links.length === 0) return
        const insert = links.join('\n')
        view.dispatch({
          changes: { from: pos, insert },
          selection: { anchor: pos + insert.length }
        })
        view.focus()
      })()
    }
    const onDragOver = (event: DragEvent): void => {
      const dt = event.dataTransfer
      if (!dt) return
      const hasImage = Array.from(dt.items).some(
        (item) => item.kind === 'file' && item.type.startsWith('image/')
      )
      if (!hasImage) return
      event.preventDefault()
      dt.dropEffect = 'copy'
    }
    const onDrop = (event: DragEvent): void => {
      const dt = event.dataTransfer
      if (!dt || !pathRef.current) return
      const files = Array.from(dt.files).filter(isImage)
      if (files.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      const pos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
      insertImages(files, pos)
    }
    const onPaste = (event: ClipboardEvent): void => {
      const dt = event.clipboardData
      if (!dt) return
      const files = Array.from(dt.items)
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file))
      if (files.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      insertImages(files, view.state.selection.main.head)
    }
    view.contentDOM.addEventListener('dragover', onDragOver)
    view.contentDOM.addEventListener('drop', onDrop)
    view.contentDOM.addEventListener('paste', onPaste)
    return () => {
      view.contentDOM.removeEventListener('dragover', onDragOver)
      view.contentDOM.removeEventListener('drop', onDrop)
      view.contentDOM.removeEventListener('paste', onPaste)
    }
  }, [filePath])

  return <div className="editor-pane" ref={hostRef} />
}
