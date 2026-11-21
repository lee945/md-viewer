import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EditorView } from '@codemirror/view'
import { renderMarkdown } from '@renderer/markdown/render'
import { resolveRelative } from '@renderer/markdown/paths'
import { loadScrollPosition, saveScrollPosition } from '@renderer/stores/persist'
import { useAppStore } from '@renderer/stores/app.store'
import { useScrollSync } from '@renderer/editor/useScrollSync'

const SAVE_DELAY = 300

interface Props {
  getEditorView: () => EditorView | null
}

function applyProgress(scroller: HTMLElement, bar: HTMLElement, fill: HTMLElement): void {
  const max = scroller.scrollHeight - scroller.clientHeight
  if (max > 1) {
    bar.dataset['visible'] = 'true'
    const ratio = Math.min(1, Math.max(0, scroller.scrollTop / max))
    fill.style.transform = `scaleX(${ratio})`
  } else {
    bar.dataset['visible'] = 'false'
  }
}

function decorate(root: HTMLElement, onZoom: (src: string) => void): void {
  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.parentElement?.classList.contains('code-wrap')) return

    const wrap = document.createElement('div')
    wrap.className = 'code-wrap'
    pre.replaceWith(wrap)
    wrap.appendChild(pre)

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'copy-btn'
    button.textContent = '复制'
    button.addEventListener('click', () => {
      const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
      void navigator.clipboard.writeText(code).then(() => {
        button.textContent = '已复制'
        window.setTimeout(() => {
          button.textContent = '复制'
        }, 1500)
      })
    })
    wrap.appendChild(button)
  })

  root.querySelectorAll('img').forEach((img) => {
    img.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onZoom(img.src)
    })

    const markBroken = (): void => {
      const span = document.createElement('span')
      span.className = 'img-error'
      const alt = img.getAttribute('alt') ?? ''
      span.textContent = alt ? `[图片加载失败] ${alt}` : '[图片加载失败]'
      img.replaceWith(span)
    }
    if (img.complete && img.naturalWidth === 0) markBroken()
    else img.addEventListener('error', markBroken, { once: true })
  })
}

export default function Preview({ getEditorView }: Props) {
  const file = useAppStore((s) => s.file)
  const theme = useAppStore((s) => s.theme)
  const preset = useAppStore((s) => s.preset)
  const viewMode = useAppStore((s) => s.viewMode)
  const openPath = useAppStore((s) => s.openPath)
  const setOutline = useAppStore((s) => s.setOutline)
  const setActiveId = useAppStore((s) => s.setActiveId)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const pendingRestoreRef = useRef<number | null>(null)
  const lastTopRef = useRef(0)
  const saveTimerRef = useRef(0)
  const prevPathRef = useRef<string | null>(null)
  const wasHiddenRef = useRef(false)
  const [html, setHtml] = useState('')
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      prevPathRef.current = null
      wasHiddenRef.current = false
      setZoomSrc(null)
      setHtml('')
      return
    }
    // 分屏之外预览不可见：不重新渲染（保留旧 html 供大纲使用），滚动位置等重新可见时恢复
    const hidden = viewMode !== 'split'
    const isNewFile = prevPathRef.current !== file.path
    const wasHidden = wasHiddenRef.current
    prevPathRef.current = file.path
    wasHiddenRef.current = hidden

    if (isNewFile) {
      // 换文件：清空旧内容并恢复存储的位置
      pendingRestoreRef.current = loadScrollPosition(file.path)
      setHtml('')
      setZoomSrc(null)
    } else if (hidden) {
      // display:none 时 scrollTop 不可信，记住上次可见时的位置
      if (pendingRestoreRef.current === null) pendingRestoreRef.current = lastTopRef.current
    } else if (!wasHidden && pendingRestoreRef.current === null) {
      // 内容/主题变化：保持当前阅读位置
      pendingRestoreRef.current = scrollerRef.current?.scrollTop ?? lastTopRef.current
    }

    if (hidden) return

    let cancelled = false
    renderMarkdown(file.content, { docPath: file.path, preset, scheme: theme })
      .then((result) => {
        if (!cancelled) setHtml(result)
      })
      .catch(() => {
        if (!cancelled) setHtml('<p>Markdown 渲染失败</p>')
      })
    return () => {
      cancelled = true
    }
  }, [file, theme, preset, viewMode])

  useLayoutEffect(() => {
    if (!file || !html || viewMode !== 'split') return
    const top = pendingRestoreRef.current
    if (top === null) return
    const scroller = scrollerRef.current
    if (scroller) scroller.scrollTop = top
    lastTopRef.current = top
    pendingRestoreRef.current = null
    if (scroller && barRef.current && progressRef.current) {
      applyProgress(scroller, barRef.current, progressRef.current)
    }
  }, [html, file, viewMode])

  useEffect(() => {
    if (!file) return
    const path = file.path
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = 0
      }
      saveScrollPosition(path, lastTopRef.current)
    }
  }, [file?.path])

  useEffect(() => {
    if (viewMode !== 'split') setZoomSrc(null)
  }, [viewMode])

  useEffect(() => {
    // 非分屏模式下预览不可见，大纲与交互由编辑器负责，避免清空编辑器产出的大纲
    if (viewMode !== 'split') return
    const root = articleRef.current
    if (!root || !html) {
      setOutline([])
      return
    }

    decorate(root, setZoomSrc)

    const headings = Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
    setOutline(
      headings.map((heading) => ({
        id: heading.id,
        level: Number(heading.tagName[1]),
        text: heading.textContent?.trim() ?? ''
      }))
    )

    const onClick = (event: MouseEvent): void => {
      const anchor = (event.target as HTMLElement | null)?.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return

      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        event.preventDefault()
        window.api.openExternal(href)
        return
      }

      if (file && /\.(md|markdown|mdown|mkd|txt)(#.*)?$/i.test(href)) {
        const target = resolveRelative(file.path, href)
        if (target) {
          event.preventDefault()
          void openPath(target)
        }
      }
    }

    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [html, file, openPath, setOutline, viewMode])

  useEffect(() => {
    const scroller = scrollerRef.current
    const root = articleRef.current
    if (!scroller || !root) return

    let raf = 0
    const update = (): void => {
      raf = 0
      // 隐藏期间（display:none）scrollTop 与几何信息都不可信
      if (scroller.offsetParent === null) return
      if (barRef.current && progressRef.current) {
        applyProgress(scroller, barRef.current, progressRef.current)
      }
      // 恢复尚未生效时（清空 html 引起的位置钳制）不记录、不保存
      if (pendingRestoreRef.current !== null) return
      lastTopRef.current = scroller.scrollTop

      const scrollerTop = scroller.getBoundingClientRect().top
      const headings = Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
      let current: HTMLElement | null = null
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top - scrollerTop <= 24) current = heading
        else break
      }
      setActiveId(current?.id ?? headings[0]?.id ?? null)

      if (file) {
        const path = file.path
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = window.setTimeout(() => {
          saveTimerRef.current = 0
          saveScrollPosition(path, lastTopRef.current)
        }, SAVE_DELAY)
      }
    }
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    scroller.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = 0
      }
    }
  }, [html, file, setActiveId])

  useEffect(() => {
    if (!zoomSrc) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setZoomSrc(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoomSrc])

  useScrollSync({
    enabled: viewMode === 'split',
    html,
    getEditorView,
    scrollerRef,
    articleRef
  })

  if (!file) return null

  return (
    <div className="content" ref={scrollerRef}>
      <div className="progress-bar" data-visible="false" ref={barRef}>
        <div className="progress-fill" ref={progressRef} />
      </div>
      <article
        className="markdown-body"
        ref={articleRef}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {zoomSrc &&
        createPortal(
          <div
            className="zoom-overlay"
            role="dialog"
            aria-label="图片预览"
            onClick={() => setZoomSrc(null)}
          >
            <img src={zoomSrc} alt="" onClick={(event) => event.stopPropagation()} />
          </div>,
          document.body
        )}
    </div>
  )
}
