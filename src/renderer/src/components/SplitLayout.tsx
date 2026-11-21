import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useAppStore } from '@renderer/stores/app.store'

const RATIO_KEY = 'mdv.splitRatio'
const MIN_RATIO = 0.3
const MAX_RATIO = 0.7

function loadRatio(): number {
  const saved = Number(localStorage.getItem(RATIO_KEY))
  return Number.isFinite(saved) && saved >= MIN_RATIO && saved <= MAX_RATIO ? saved : 0.5
}

function applyRatio(root: HTMLElement | null, ratio: number): void {
  root?.style.setProperty('--split-ratio', `${ratio * 100}%`)
}

interface Props {
  editor: ReactNode
  preview: ReactNode
}

/** 三种显示模式共用一套常驻挂载的编辑器/预览，仅用 CSS 显隐，保护撤销历史与滚动位置 */
export default function SplitLayout({ editor, preview }: Props) {
  const viewMode = useAppStore((s) => s.viewMode)
  const rootRef = useRef<HTMLDivElement>(null)
  const ratioRef = useRef(loadRatio())
  const draggingRef = useRef(false)

  useLayoutEffect(() => {
    applyRatio(rootRef.current, ratioRef.current)
  }, [viewMode])

  const updateFromClientX = (clientX: number): void => {
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    if (rect.width <= 0) return
    ratioRef.current = Math.min(MAX_RATIO, Math.max(MIN_RATIO, (clientX - rect.left) / rect.width))
    applyRatio(root, ratioRef.current)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.dataset['dragging'] = 'true'
    updateFromClientX(event.clientX)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    updateFromClientX(event.clientX)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    delete document.body.dataset['dragging']
    localStorage.setItem(RATIO_KEY, ratioRef.current.toFixed(4))
  }

  return (
    <div className="editor-layout" data-mode={viewMode} ref={rootRef}>
      {editor}
      <div
        className="split-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整编辑与预览宽度"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      {preview}
    </div>
  )
}
