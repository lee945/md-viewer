import { useEffect, type RefObject } from 'react'
import type { EditorView } from '@codemirror/view'
import { lineToTop, topToLine, type BlockRect } from '@renderer/markdown/scroll-map'

const GUARD_MS = 200

interface Options {
  enabled: boolean
  html: string
  getEditorView: () => EditorView | null
  scrollerRef: RefObject<HTMLDivElement | null>
  articleRef: RefObject<HTMLElement | null>
}

/** 只取顶层带行号属性的块，避免父子块行号范围重叠 */
function measureBlocks(article: HTMLElement): BlockRect[] {
  const articleTop = article.getBoundingClientRect().top
  const blocks: BlockRect[] = []
  article.querySelectorAll<HTMLElement>('[data-line-start]').forEach((element) => {
    if (element.parentElement?.closest('[data-line-start]')) return
    const startLine = Number(element.dataset['lineStart'])
    const endLine = Number(element.dataset['lineEnd'])
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || endLine <= startLine) return
    const rect = element.getBoundingClientRect()
    blocks.push({ startLine, endLine, top: rect.top - articleTop, height: rect.height })
  })
  blocks.sort((a, b) => a.startLine - b.startLine)
  return blocks
}

/** 分屏模式下编辑器与预览的双向滚动同步 */
export function useScrollSync(options: Options): void {
  const { enabled, html, getEditorView, scrollerRef, articleRef } = options

  useEffect(() => {
    if (!enabled) return
    const scroller = scrollerRef.current
    const article = articleRef.current
    const view = getEditorView()
    if (!scroller || !article || !view) return

    let suppressPreviewUntil = 0
    let suppressEditorUntil = 0
    let previewRaf = 0
    let editorRaf = 0

    const syncPreviewFromEditor = (): void => {
      previewRaf = 0
      if (performance.now() < suppressPreviewUntil) return
      const target = getEditorView()
      if (!target) return
      const blocks = measureBlocks(article)
      if (blocks.length === 0) return
      const block = target.lineBlockAtHeight(target.scrollDOM.scrollTop)
      const lineInfo = target.state.doc.lineAt(block.from)
      const fraction =
        block.height > 0 ? (target.scrollDOM.scrollTop - block.top) / block.height : 0
      const line = lineInfo.number + Math.min(1, Math.max(0, fraction))
      const top = lineToTop(blocks, line)
      suppressPreviewUntil = performance.now() + GUARD_MS
      scroller.scrollTop = top
    }

    const syncEditorFromPreview = (): void => {
      editorRaf = 0
      if (performance.now() < suppressEditorUntil) return
      const target = getEditorView()
      if (!target) return
      const blocks = measureBlocks(article)
      if (blocks.length === 0) return
      const line = topToLine(blocks, scroller.scrollTop)
      const lineNo = Math.min(target.state.doc.lines, Math.max(1, Math.floor(line)))
      const block = target.lineBlockAt(target.state.doc.line(lineNo).from)
      const fraction = Math.min(1, Math.max(0, line - lineNo))
      suppressEditorUntil = performance.now() + GUARD_MS
      target.scrollDOM.scrollTop = block.top + block.height * fraction
    }

    const onEditorScroll = (): void => {
      if (performance.now() < suppressEditorUntil) return
      if (!previewRaf) previewRaf = requestAnimationFrame(syncPreviewFromEditor)
    }
    const onPreviewScroll = (): void => {
      if (performance.now() < suppressPreviewUntil) return
      if (!editorRaf) editorRaf = requestAnimationFrame(syncEditorFromPreview)
    }

    view.scrollDOM.addEventListener('scroll', onEditorScroll, { passive: true })
    scroller.addEventListener('scroll', onPreviewScroll, { passive: true })
    return () => {
      view.scrollDOM.removeEventListener('scroll', onEditorScroll)
      scroller.removeEventListener('scroll', onPreviewScroll)
      if (previewRaf) cancelAnimationFrame(previewRaf)
      if (editorRaf) cancelAnimationFrame(editorRaf)
    }
  }, [enabled, html, getEditorView, scrollerRef, articleRef])
}
