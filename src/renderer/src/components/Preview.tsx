import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FileInfo } from '@shared/types'
import { renderMarkdown } from '@renderer/markdown/render'
import { resolveRelative } from '@renderer/markdown/paths'
import { loadScrollPosition, saveScrollPosition } from '@renderer/stores/persist'
import { useAppStore } from '@renderer/stores/app.store'

const SAVE_DELAY = 300

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

export default function Preview() {
  const file = useAppStore((s) => s.file)
  const theme = useAppStore((s) => s.theme)
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
  const prevFileRef = useRef<FileInfo | null>(null)
  const [html, setHtml] = useState('')
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      prevFileRef.current = null
      setZoomSrc(null)
      setHtml('')
      return
    }
    // 换文件：恢复存储的位置；换主题（同一对象）：保持当前阅读位置
    const isNewFile = prevFileRef.current !== file
    prevFileRef.current = file
    pendingRestoreRef.current = isNewFile
      ? loadScrollPosition(file.path)
      : (scrollerRef.current?.scrollTop ?? lastTopRef.current)
    setZoomSrc(null)

    let cancelled = false
    setHtml('')
    renderMarkdown(file.content, { docPath: file.path, theme })
      .then((result) => {
        if (!cancelled) setHtml(result)
      })
      .catch(() => {
        if (!cancelled) setHtml('<p>Markdown 渲染失败</p>')
      })
    return () => {
      cancelled = true
    }
  }, [file, theme])

  useLayoutEffect(() => {
    if (!file || !html) return
    const top = pendingRestoreRef.current
    if (top === null) return
    const scroller = scrollerRef.current
    if (scroller) scroller.scrollTop = top
    lastTopRef.current = top
    pendingRestoreRef.current = null
    if (scroller && barRef.current && progressRef.current) {
      applyProgress(scroller, barRef.current, progressRef.current)
    }
  }, [html, file])

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
  }, [file])

  useEffect(() => {
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
  }, [html, file, openPath, setOutline])

  useEffect(() => {
    const scroller = scrollerRef.current
    const root = articleRef.current
    if (!scroller || !root) return

    let raf = 0
    const update = (): void => {
      raf = 0
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
        if (heading.getBoundingClientRect().top - scrollerTop <= 96) current = heading
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
