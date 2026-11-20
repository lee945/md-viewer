import { useEffect, useRef, useState } from 'react'
import { renderMarkdown } from '@renderer/markdown/render'
import { resolveRelative } from '@renderer/markdown/paths'
import { useAppStore } from '@renderer/stores/app.store'

function decorate(root: HTMLElement): void {
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
  const [html, setHtml] = useState('')

  useEffect(() => {
    if (!file) {
      setHtml('')
      return
    }
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

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0, left: 0 })
  }, [file?.path])

  useEffect(() => {
    const root = articleRef.current
    if (!root || !html) {
      setOutline([])
      return
    }

    decorate(root)

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
      const scrollerTop = scroller.getBoundingClientRect().top
      const headings = Array.from(root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'))
      let current: HTMLElement | null = null
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top - scrollerTop <= 96) current = heading
        else break
      }
      setActiveId(current?.id ?? headings[0]?.id ?? null)
    }
    const onScroll = (): void => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    scroller.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [html, setActiveId])

  if (!file) return null

  return (
    <div className="content" ref={scrollerRef}>
      <article
        className="markdown-body"
        ref={articleRef}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
