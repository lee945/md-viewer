import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { StateEffect, StateField, type EditorState, type Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { ColorScheme } from '@shared/types'
import type { ThemePreset } from '@shared/themes'
import { md } from '@renderer/markdown/parser'
import { ensureLanguages, highlightCode } from '@renderer/markdown/highlighter'
import { sanitizeHtml } from '@renderer/markdown/sanitize'
import { resolveRelative, toAssetUrl } from '@renderer/markdown/paths'

export type LiveMode = 'ir' | 'wysiwyg'

export interface LiveTheme {
  preset: ThemePreset
  scheme: ColorScheme
}

class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-md-bullet'
    span.textContent = '•'
    return span
  }
  eq(): boolean {
    return true
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
    private readonly to: number
  ) {
    super()
  }
  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from && other.to === this.to
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-md-checkbox'
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.addEventListener('click', (event) => {
      event.preventDefault()
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' }
      })
    })
    wrap.appendChild(box)
    return wrap
  }
  ignoreEvent(): boolean {
    return true
  }
}

function fillImage(wrap: HTMLElement, src: string, alt: string): void {
  const img = document.createElement('img')
  img.alt = alt
  img.draggable = false
  const markBroken = (): void => {
    const span = document.createElement('span')
    span.className = 'img-error'
    const shortAlt = alt.length > 30 ? `${alt.slice(0, 30)}…` : alt
    span.textContent = shortAlt ? `[图片加载失败] ${shortAlt}` : '[图片加载失败]'
    if (alt) span.title = alt
    wrap.replaceChildren(span)
  }
  img.src = src
  // md-asset 自定义协议下 Chromium 的懒加载不会真正发起请求，只对远程图片启用
  if (/^https?:/i.test(src)) img.loading = 'lazy'
  wrap.appendChild(img)
  if (img.complete && img.naturalWidth === 0) markBroken()
  else img.addEventListener('error', markBroken, { once: true })
}

class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly pos: number,
    private readonly end: number,
    private readonly mode: LiveMode
  ) {
    super()
  }
  eq(other: ImageWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.pos === this.pos &&
      other.end === this.end &&
      other.mode === this.mode
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-md-image'
    fillImage(wrap, this.src, this.alt)
    // ir 模式选中整段源码（即刻看到带选区的源码行）；wysiwyg 只落光标，避免整图被选区方框罩住
    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault()
      view.dispatch({
        selection:
          this.mode === 'ir' ? { anchor: this.pos, head: this.end } : { anchor: this.pos },
        scrollIntoView: true,
        userEvent: 'select'
      })
    })
    return wrap
  }
}

/** 光标在图片行时，行下方挂一个块级图片预览，源码行保持真实文本可选中/编辑 */
class ImageBlockWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string
  ) {
    super()
  }
  eq(other: ImageBlockWidget): boolean {
    return other.src === this.src && other.alt === this.alt
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-md-image-block'
    fillImage(wrap, this.src, this.alt)
    return wrap
  }
}

/** 行内脚注引用标记 [^label] → 上标 */
class FootnoteRefWidget extends WidgetType {
  constructor(private readonly index: number) {
    super()
  }
  eq(other: FootnoteRefWidget): boolean {
    return other.index === this.index
  }
  toDOM(): HTMLElement {
    const sup = document.createElement('sup')
    sup.className = 'cm-md-fn-ref'
    sup.textContent = `[${this.index}]`
    return sup
  }
}

function copyButton(code: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'copy-btn'
  btn.textContent = '复制'
  btn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void navigator.clipboard.writeText(code).then(() => {
      btn.textContent = '已复制'
      window.setTimeout(() => {
        btn.textContent = '复制'
      }, 1500)
    })
  })
  return btn
}

/** 点击渲染块落光标进源码块内，块随即切换回源码形态（选中/编辑） */
function revealOnMousedown(
  wrap: HTMLElement,
  view: EditorView,
  pos: number,
  keepInteractive: boolean
): void {
  wrap.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.copy-btn')) return
    // HTML 块内的原生交互元素（折叠面板、链接等）不拦截
    if (keepInteractive && target.closest('summary, a, button, input, select, textarea, video, audio')) {
      return
    }
    event.preventDefault()
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
    view.focus()
  })
}

/** 代码块：Shiki 高亮 + 悬停复制按钮；高亮不可用时降级为普通代码块 */
class CodeBlockWidget extends WidgetType {
  constructor(
    private readonly code: string,
    private readonly html: string,
    private readonly contentFrom: number,
    private readonly firstContentLine: number,
    private readonly lang: string,
    private readonly fencePos: number | null
  ) {
    super()
  }
  eq(other: CodeBlockWidget): boolean {
    return (
      other.code === this.code &&
      other.html === this.html &&
      other.lang === this.lang &&
      other.contentFrom === this.contentFrom &&
      other.firstContentLine === this.firstContentLine &&
      other.fencePos === this.fencePos
    )
  }
  /** 按点击纵坐标估算落在第几行代码，返回切换后应落光标的文档位置 */
  private targetFor(view: EditorView, wrap: HTMLElement, clientY: number): number {
    const pre = wrap.querySelector('pre')
    const codeEl = pre?.querySelector('code') ?? pre
    const lines = this.code.split('\n').length
    if (!pre || !codeEl || lines <= 0) return this.contentFrom
    const rect = pre.getBoundingClientRect()
    const style = getComputedStyle(codeEl)
    const lineHeight = parseFloat(style.lineHeight)
    const padTop = parseFloat(style.paddingTop) || 0
    if (!lineHeight) return this.contentFrom
    const index = Math.min(
      Math.max(Math.floor((clientY - rect.top - padTop) / lineHeight), 0),
      lines - 1
    )
    const doc = view.state.doc
    const lineNumber = Math.min(this.firstContentLine + index, doc.lines)
    return Math.max(doc.line(lineNumber).from, this.contentFrom)
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-md-block cm-md-rendered markdown-body cm-md-codeblock'
    const inner = document.createElement('div')
    inner.className = 'code-wrap'
    if (this.html) {
      inner.innerHTML = this.html
    } else {
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = this.code
      pre.appendChild(code)
      inner.appendChild(pre)
    }
    if (this.fencePos != null) {
      // 语言标签：点击落到围栏行上，露出 ``` 行便于改语言
      const tag = document.createElement('button')
      tag.type = 'button'
      tag.className = 'code-lang-tag'
      tag.textContent = this.lang || '```'
      tag.addEventListener('mousedown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (this.fencePos == null) return
        view.dispatch({ selection: { anchor: this.fencePos }, scrollIntoView: true })
        view.focus()
      })
      inner.appendChild(tag)
    }
    inner.appendChild(copyButton(this.code))
    wrap.appendChild(inner)
    wrap.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return
      const target = event.target as HTMLElement
      if (target.closest('.copy-btn, .code-lang-tag')) return
      event.preventDefault()
      const pos = this.targetFor(view, wrap, event.clientY)
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
      view.focus()
    })
    return wrap
  }
}

/** 表格 / HTML 块 / 脚注定义：直接复用 markdown-it 的渲染结果与 .markdown-body 样式 */
class RenderedHtmlWidget extends WidgetType {
  constructor(
    private readonly html: string,
    private readonly revealPos: number,
    private readonly interactive: boolean
  ) {
    super()
  }
  eq(other: RenderedHtmlWidget): boolean {
    return other.html === this.html && other.interactive === this.interactive
  }
  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-md-block cm-md-rendered markdown-body'
    wrap.innerHTML = this.html
    for (const img of Array.from(wrap.querySelectorAll('img'))) {
      const remeasure = (): void => view.requestMeasure()
      img.addEventListener('load', remeasure, { once: true })
      img.addEventListener('error', remeasure, { once: true })
    }
    // 渲染块里的链接不能直接导航窗口：外链交给系统浏览器
    wrap.addEventListener('click', (event) => {
      const anchor = (event.target as HTMLElement).closest('a')
      if (!anchor) return
      event.preventDefault()
      const href = anchor.getAttribute('href')
      if (href && /^(https?:|mailto:|tel:)/i.test(href)) window.api.openExternal(href)
    })
    revealOnMousedown(wrap, view, this.revealPos, this.interactive)
    return wrap
  }
}

function resolveImage(src: string, docPath: string | null): string | null {
  if (!src) return null
  if (/^[a-zA-Z][\w+.-]*:/.test(src) || src.startsWith('//')) return src
  if (!docPath) return null
  const absolute = resolveRelative(docPath, src)
  return absolute ? toAssetUrl(absolute) : null
}

interface FootnoteDef {
  label: string
  index: number
  from: number
  to: number
  content: string
}

let footnoteCache: { state: EditorState; list: FootnoteDef[] } | null = null

/** 按行扫描脚注定义（[^label]: 内容，缩进行算作续行） */
function footnotesOf(state: EditorState): FootnoteDef[] {
  if (footnoteCache?.state === state) return footnoteCache.list
  const doc = state.doc
  const list: FootnoteDef[] = []
  const seen = new Set<string>()
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const match = /^ {0,3}\[\^([^\]]+)\]:[ \t]?(.*)$/.exec(line.text)
    if (!match) continue
    const label = match[1].toLowerCase()
    if (seen.has(label)) continue
    seen.add(label)
    const parts = [match[2]]
    let end = n
    while (end < doc.lines) {
      const next = doc.line(end + 1).text
      if (!/^(?: {4,}|\t)/.test(next)) break
      parts.push(next.replace(/^(?: {4}|\t)/, ''))
      end++
    }
    list.push({
      label,
      index: list.length + 1,
      from: line.from,
      to: doc.line(end).to,
      content: parts.join('\n').trim()
    })
    n = end
  }
  footnoteCache = { state, list }
  return list
}

const fragmentCache = new Map<string, string>()
const FRAGMENT_CACHE_LIMIT = 200

function renderFragment(source: string, docPath: string | null, inline = false): string {
  const key = `${inline ? 'i' : 'b'}|${docPath ?? ''}|${source}`
  const hit = fragmentCache.get(key)
  if (hit !== undefined) return hit
  let html = ''
  try {
    const env = { docPath: docPath ?? '' }
    html = sanitizeHtml(inline ? md.renderInline(source, env) : md.render(source, env))
  } catch {
    html = ''
  }
  if (fragmentCache.size >= FRAGMENT_CACHE_LIMIT) fragmentCache.clear()
  fragmentCache.set(key, html)
  return html
}

const highlightCache = new Map<string, string>()
const HIGHLIGHT_CACHE_LIMIT = 200

function cachedHighlight(code: string, lang: string, theme: LiveTheme): string {
  if (!code || !lang) return ''
  const key = `${theme.preset}|${theme.scheme}|${lang}|${code}`
  const hit = highlightCache.get(key)
  if (hit !== undefined) return hit
  const html = highlightCode(code, lang, theme.preset, theme.scheme)
  if (!html) return '' // 语言尚未加载完成，不缓存，等 refresh 后重试
  const safe = sanitizeHtml(html)
  if (highlightCache.size >= HIGHLIGHT_CACHE_LIMIT) highlightCache.clear()
  highlightCache.set(key, safe)
  return safe
}

/** 去掉行首的引用标记（支持嵌套），代码内容在引用内需要还原 */
function stripQuoteMarks(line: string): string {
  return line.replace(/^(?:[ \t]*>[ \t]?)+/, '')
}

/** 行首连续的 > 标记层数 */
function quoteDepth(text: string): number {
  let depth = 0
  let rest = text
  let match: RegExpExecArray | null
  while ((match = /^[ \t]*>/.exec(rest))) {
    depth++
    rest = rest.slice(match[0].length).replace(/^ /, '')
  }
  return depth
}

function fencedCode(state: EditorState, child: SyntaxNode): { code: string; lang: string } {
  const doc = state.doc
  const info = child.getChild('CodeInfo')
  const lang = info ? doc.sliceString(info.from, info.to).trim() : ''
  const marks = child.getChildren('CodeMark')
  const first = marks[0]
  if (!first) return { code: doc.sliceString(child.from, child.to), lang }
  const last = marks.length >= 2 ? marks[marks.length - 1] : null
  const openLine = doc.lineAt(first.from)
  const openText = stripQuoteMarks(openLine.text)
  const indent = openText.match(/^[ \t]*/)?.[0].length ?? 0
  const endLine = last ? doc.lineAt(last.from).number - 1 : doc.lineAt(child.to).number
  const lines: string[] = []
  for (let n = openLine.number + 1; n <= endLine; n++) {
    let text = stripQuoteMarks(doc.line(n).text)
    let cut = 0
    while (cut < indent && (text[cut] === ' ' || text[cut] === '\t')) cut++
    lines.push(text.slice(cut))
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return { code: lines.join('\n'), lang }
}

function indentedCode(state: EditorState, child: SyntaxNode): string {
  const doc = state.doc
  const start = doc.lineAt(child.from).number
  const end = doc.lineAt(child.to).number
  const lines: string[] = []
  for (let n = start; n <= end; n++) {
    const text = stripQuoteMarks(doc.line(n).text).replace(/^(?: {4}|\t)/, '')
    lines.push(text)
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

const VOID_TAGS = /^(?:br|hr|img|input|meta|link|source|track|area|base|col|embed|param|wbr)$/

/** HTML 块会被空行切断（如 details 内的段落），按首尾标签把整段并成一个渲染区域 */
function htmlRegion(state: EditorState, child: SyntaxNode): { from: number; to: number } {
  const doc = state.doc
  const firstLine = doc.lineAt(child.from)
  const raw = doc.sliceString(child.from, child.to)
  const open = /^[ \t]*<([a-zA-Z][\w-]*)\b/.exec(firstLine.text)
  if (!open) return { from: child.from, to: child.to }
  const tag = open[1].toLowerCase()
  if (VOID_TAGS.test(tag)) return { from: child.from, to: child.to }
  if (new RegExp(`</${tag}\\s*>`, 'i').test(raw)) return { from: child.from, to: child.to }
  const closeRe = new RegExp(`^\\s*</${tag}\\s*>\\s*$`, 'i')
  const fromLine = doc.lineAt(child.to).number + 1
  const lastLine = Math.min(doc.lines, fromLine + 200)
  for (let n = fromLine; n <= lastLine; n++) {
    if (closeRe.test(doc.line(n).text)) return { from: child.from, to: doc.line(n).to }
  }
  return { from: child.from, to: child.to }
}

function buildDecorations(
  view: EditorView,
  mode: LiveMode,
  docPath: string | null
): DecorationSet {
  const state = view.state
  const doc = state.doc
  const ranges: Range<Decoration>[] = []
  const activeLines = new Set<number>()
  if (mode === 'ir') {
    for (const range of state.selection.ranges) {
      const first = doc.lineAt(range.from).number
      const last = doc.lineAt(range.to).number
      for (let n = first; n <= last; n++) activeLines.add(n)
    }
  }

  const hideAllowed = (pos: number): boolean =>
    mode === 'wysiwyg' || !activeLines.has(doc.lineAt(pos).number)

  /** 隐藏标记及其后的空格（不跨行） */
  const hide = (from: number, to: number): void => {
    if (from >= to) return
    const lineEnd = doc.lineAt(from).to
    let end = to
    while (end < lineEnd && doc.sliceString(end, end + 1) === ' ') end++
    ranges.push(Decoration.replace({}).range(from, Math.min(end, lineEnd)))
  }

  const quoteLines = new Set<number>()

  /** 行内 HTML 成对标签 → 隐藏标签文本并给内容套样式（仅常见排版标签） */
  const INLINE_HTML_CLASS: Record<string, string> = {
    kbd: 'cm-md-html-kbd',
    mark: 'cm-md-html-mark',
    sub: 'cm-md-html-sub',
    sup: 'cm-md-html-sup'
  }
  const htmlStack: { tag: string; from: number; to: number }[] = []

  const lineDeco = (pos: number, cls: string): void => {
    ranges.push(Decoration.line({ class: cls }).range(doc.lineAt(pos).from))
  }

  const markDeco = (from: number, to: number, cls: string, attrs?: Record<string, string>): void => {
    if (from >= to) return
    ranges.push(Decoration.mark({ class: cls, attributes: attrs }).range(from, to))
  }

  const hideMarks = (marks: readonly { from: number; to: number }[], pos: number): void => {
    if (!hideAllowed(pos)) return
    for (const mark of marks) hide(mark.from, mark.to)
  }

  const footnoteIndex = new Map<string, number>()
  for (const def of footnotesOf(state)) footnoteIndex.set(def.label, def.index)

  syntaxTree(state).iterate({
    from: view.viewport.from,
    to: view.viewport.to,
    enter: (node) => {
      const name = node.name
      const child = node.node

      if (/^ATXHeading[1-6]$/.test(name)) {
        lineDeco(node.from, `cm-md-h${name[10]}`)
        const marks = child.getChildren('HeaderMark')
        if (marks.length > 0 && hideAllowed(node.from)) {
          hide(marks[0].from, marks[0].to)
          if (marks.length > 1) {
            const last = marks[marks.length - 1]
            let from = last.from
            while (from > 0 && doc.sliceString(from - 1, from) === ' ') from--
            hide(from, last.to)
          }
        }
        return
      }

      if (name === 'SetextHeading1' || name === 'SetextHeading2') {
        lineDeco(node.from, name === 'SetextHeading1' ? 'cm-md-h1' : 'cm-md-h2')
        lineDeco(node.to - 1, 'cm-md-setext-mark')
        return
      }

      if (name === 'QuoteMark') {
        // QuoteMark 可能直接挂在 Blockquote 下，也可能嵌在列表项里（引用续行）；
        // 代码块内的 QuoteMark 因 FencedCode/CodeBlock 分支提前 return false 而不会被访问到
        const lineFrom = doc.lineAt(node.from).from
        if (!quoteLines.has(lineFrom)) {
          quoteLines.add(lineFrom)
          const depth = quoteDepth(doc.lineAt(node.from).text)
          lineDeco(node.from, depth > 1 ? 'cm-md-quote cm-md-quote-d2' : 'cm-md-quote')
        }
        if (hideAllowed(node.from)) hide(node.from, node.to)
        return false
      }

      if (name === 'ListMark') {
        const text = doc.sliceString(node.from, node.to)
        if (/^[-+*]$/.test(text)) {
          if (hideAllowed(node.from)) {
            ranges.push(
              Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to)
            )
          }
        } else {
          markDeco(node.from, node.to, 'cm-md-ordered-mark')
        }
        return false
      }

      if (name === 'TaskMarker') {
        if (hideAllowed(node.from)) {
          const checked = /\[[xX]\]/.test(doc.sliceString(node.from, node.to))
          ranges.push(
            Decoration.replace({
              widget: new CheckboxWidget(checked, node.from, node.to)
            }).range(node.from, node.to)
          )
        }
        return false
      }

      if (name === 'HTMLTag') {
        const text = doc.sliceString(node.from, node.to)
        const open = /^<([a-zA-Z][a-zA-Z0-9-]*)\s*>$/.exec(text)
        const close = /^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>$/.exec(text)
        if (open) {
          const tag = open[1].toLowerCase()
          if (INLINE_HTML_CLASS[tag]) htmlStack.push({ tag, from: node.from, to: node.to })
        } else if (close) {
          const tag = close[1].toLowerCase()
          const idx = htmlStack.map((item) => item.tag).lastIndexOf(tag)
          if (idx >= 0 && INLINE_HTML_CLASS[tag]) {
            const opener = htmlStack[idx]
            htmlStack.length = idx
            if (hideAllowed(opener.from)) {
              // 不用 hide()，避免吞掉闭合标签后的空格
              if (opener.from < opener.to) {
                ranges.push(Decoration.replace({}).range(opener.from, opener.to))
              }
              if (node.from < node.to) {
                ranges.push(Decoration.replace({}).range(node.from, node.to))
              }
              markDeco(opener.to, node.from, INLINE_HTML_CLASS[tag])
            }
          }
        }
        return false
      }

      if (name === 'HorizontalRule') {
        if (hideAllowed(node.from)) {
          lineDeco(node.from, 'cm-md-hr')
          ranges.push(Decoration.replace({}).range(node.from, node.to))
        }
        return false
      }

      if (name === 'FencedCode' || name === 'CodeBlock' || name === 'IndentedCode') {
        return false
      }

      if (name === 'InlineCode') {
        const marks = child.getChildren('CodeMark')
        if (marks.length >= 2) {
          hideMarks([marks[0], marks[marks.length - 1]], node.from)
          markDeco(marks[0].to, marks[marks.length - 1].from, 'cm-md-code')
        } else {
          markDeco(node.from, node.to, 'cm-md-code')
        }
        return false
      }

      if (name === 'Emphasis' || name === 'StrongEmphasis' || name === 'Strikethrough') {
        const markName = name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark'
        const marks = child.getChildren(markName)
        const cls =
          name === 'Emphasis' ? 'cm-md-em' : name === 'StrongEmphasis' ? 'cm-md-strong' : 'cm-md-strike'
        if (marks.length >= 2) {
          hideMarks([marks[0], marks[marks.length - 1]], node.from)
          markDeco(marks[0].to, marks[marks.length - 1].from, cls)
        } else {
          markDeco(node.from, node.to, cls)
        }
        return false
      }

      if (name === 'Link') {
        const text = doc.sliceString(node.from, node.to)
        // 脚注引用 [^label] 在 lezer 里会被解析成 Link，这里换成上标标记
        if (text.startsWith('[^')) {
          if (hideAllowed(node.from)) {
            const re = /\[\^([^\]]+)\]/g
            let match: RegExpExecArray | null
            while ((match = re.exec(text))) {
              const index = footnoteIndex.get(match[1].toLowerCase())
              if (!index) continue
              const from = node.from + match.index
              ranges.push(
                Decoration.replace({ widget: new FootnoteRefWidget(index) }).range(
                  from,
                  from + match[0].length
                )
              )
            }
          }
          return false
        }
        const marks = child.getChildren('LinkMark')
        const url = child.getChild('URL')
        const linkTitle = child.getChild('LinkTitle')
        hideMarks(marks, node.from)
        if (hideAllowed(node.from)) {
          if (url) hide(url.from, url.to)
          if (linkTitle) hide(linkTitle.from, linkTitle.to)
        }
        if (marks.length >= 2) {
          const href = url ? doc.sliceString(url.from, url.to) : ''
          markDeco(marks[0].to, marks[1].from, 'cm-md-link', href ? { title: href } : undefined)
        }
        return false
      }

      if (name === 'Autolink') {
        const marks = child.getChildren('LinkMark')
        hideMarks(marks, node.from)
        markDeco(node.from, node.to, 'cm-md-link')
        return false
      }

      // GFM 裸链接（https://… 直接书写）
      if (name === 'URL') {
        markDeco(node.from, node.to, 'cm-md-link')
        return false
      }

      if (name === 'Image') {
        const marks = child.getChildren('LinkMark')
        const url = child.getChild('URL')
        if (marks.length >= 1 && url) {
          const src = resolveImage(doc.sliceString(url.from, url.to), docPath)
          const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : ''
          if (src) {
            if (mode === 'ir' && !hideAllowed(node.from)) {
              // 光标在本行：源码保留为真实文本（可选中复制/编辑），下方图片由 state 层的块级预览负责
              lineDeco(node.from, 'cm-md-image-line cm-md-image-src')
            } else {
              // 图片是原子块：光标落在该行也保持图片渲染，避免点击一下整行变成源码
              lineDeco(node.from, 'cm-md-image-line')
              ranges.push(
                Decoration.replace({
                  widget: new ImageWidget(src, alt, node.from, node.to, mode)
                }).range(node.from, node.to)
              )
            }
          }
        }
        return false
      }

      return
    }
  })

  return Decoration.set(ranges, true)
}

const REFRESH_BLOCKS = StateEffect.define<null>()

const FENCE_LANG_RE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*([\w#+.-]+)?/gm

function fenceLanguages(source: string): string[] {
  const langs: string[] = []
  for (const match of source.matchAll(FENCE_LANG_RE)) {
    if (match[1]) langs.push(match[1])
  }
  return langs
}

/** 光标在图片行时，行下方的块级图片预览（块级装饰只能由 StateField 提供） */
function addImagePreviews(
  state: EditorState,
  docPath: string | null,
  ranges: Range<Decoration>[]
): void {
  const doc = state.doc
  const seen = new Set<number>()
  for (const range of state.selection.ranges) {
    const line = doc.lineAt(range.from)
    if (seen.has(line.number)) continue
    seen.add(line.number)
    const tree = ensureSyntaxTree(state, line.to, 50) ?? syntaxTree(state)
    tree.iterate({
      from: line.from,
      to: line.to,
      enter: (node) => {
        if (node.name !== 'Image') return
        const child = node.node
        const url = child.getChild('URL')
        if (!url) return
        const src = resolveImage(doc.sliceString(url.from, url.to), docPath)
        if (!src) return
        const marks = child.getChildren('LinkMark')
        const alt = marks.length >= 2 ? doc.sliceString(marks[0].to, marks[1].from) : ''
        ranges.push(
          Decoration.widget({
            widget: new ImageBlockWidget(src, alt),
            block: true,
            side: 1
          }).range(line.to)
        )
        return false
      }
    })
  }
}

/** 块级渲染：代码块/表格/HTML 块/脚注定义在非源码态隐藏原文、显示渲染结果 */
function buildRenderedBlocks(
  state: EditorState,
  mode: LiveMode,
  getDocPath: () => string | null,
  getTheme: () => LiveTheme
): DecorationSet {
  const doc = state.doc
  const ranges: Range<Decoration>[] = []
  const theme = getTheme()
  const docPath = getDocPath()
  const selection = state.selection.ranges
  const revealed = (from: number, to: number): boolean =>
    selection.some((range) => range.from <= to && range.to >= from)
  const hidden = new Set<number>()

  const hideLine = (lineNumber: number): void => {
    const line = doc.line(lineNumber)
    if (hidden.has(line.from)) return
    hidden.add(line.from)
    ranges.push(Decoration.line({ class: 'cm-md-block-hidden' }).range(line.from))
  }

  const addBlock = (from: number, to: number, widget: WidgetType): void => {
    if (revealed(from, to)) return
    const first = doc.lineAt(from).number
    const last = doc.lineAt(to).number
    for (let n = first; n <= last; n++) hideLine(n)
    ranges.push(Decoration.widget({ widget, block: true, side: 1 }).range(to))
  }

  /** 代码块编辑态：源码行保留为可编辑文本，按代码块样式呈现 */
  const addCodeSource = (first: number, last: number, fences?: Set<number>): void => {
    for (let n = first; n <= last; n++) {
      const line = doc.line(n)
      let cls = 'cm-md-codeblock-src'
      if (fences?.has(n)) cls += ' cm-md-codeblock-fence'
      if (n === first) cls += ' cm-md-codeblock-first'
      if (n === last) cls += ' cm-md-codeblock-last'
      const depth = quoteDepth(line.text)
      if (depth > 0) cls += depth > 1 ? ' cm-md-quote cm-md-quote-d2' : ' cm-md-quote'
      ranges.push(Decoration.line({ class: cls }).range(line.from))
      const prefix = line.text.match(/^(?:[ \t]*>[ \t]?)+/)?.[0].length ?? 0
      if (prefix > 0) ranges.push(Decoration.replace({}).range(line.from, line.from + prefix))
    }
  }

  const tree = ensureSyntaxTree(state, doc.length, 150) ?? syntaxTree(state)
  let coveredTo = 0
  tree.iterate({
    enter: (node) => {
      const name = node.name
      if (name === 'FencedCode' || name === 'CodeBlock' || name === 'IndentedCode') {
        const from = doc.lineAt(node.from).from
        const to = doc.lineAt(node.to).to
        const { code, lang } =
          name === 'FencedCode'
            ? fencedCode(state, node.node)
            : { code: indentedCode(state, node.node), lang: '' }
        if (name === 'FencedCode') {
          const marks = node.node.getChildren('CodeMark')
          const openLine = marks.length > 0 ? doc.lineAt(marks[0].from) : null
          const closeLine =
            marks.length >= 2 ? doc.lineAt(marks[marks.length - 1].from) : null
          const firstContent = openLine ? openLine.number + 1 : doc.lineAt(node.from).number
          const lastContent = closeLine ? closeLine.number - 1 : doc.lineAt(node.to).number
          if (revealed(from, to)) {
            // 光标在块内：围栏行与内容行都保留为可编辑文本（围栏行暗色小字）。
            // 不能隐藏围栏行——display:none 的隐藏行紧邻可编辑行时，
            // Chromium 原生的光标几何计算会错乱（End/上下键跳到块外，输入越出围栏）
            const fences = new Set<number>()
            if (openLine) fences.add(openLine.number)
            if (closeLine) fences.add(closeLine.number)
            const lastLine = closeLine ? closeLine.number : doc.lineAt(node.to).number
            const firstLine = openLine ? openLine.number : doc.lineAt(node.from).number
            addCodeSource(firstLine, lastLine, fences)
            return false
          }
          const contentFrom =
            firstContent <= lastContent ? doc.line(firstContent).from : (openLine?.to ?? from)
          addBlock(
            from,
            to,
            new CodeBlockWidget(
              code,
              cachedHighlight(code, lang, theme),
              contentFrom,
              firstContent,
              lang,
              openLine ? openLine.to : null
            )
          )
          return false
        }
        if (revealed(from, to)) {
          addCodeSource(doc.lineAt(node.from).number, doc.lineAt(node.to).number)
          return false
        }
        addBlock(
          from,
          to,
          new CodeBlockWidget(
            code,
            cachedHighlight(code, lang, theme),
            from,
            doc.lineAt(node.from).number,
            '',
            null
          )
        )
        return false
      }

      if (name === 'Table') {
        const from = doc.lineAt(node.from).from
        const to = doc.lineAt(node.to).to
        const html = renderFragment(doc.sliceString(from, to), docPath)
        if (html.replace(/\s+/g, '')) {
          addBlock(from, to, new RenderedHtmlWidget(html, Math.min(from + 1, to), false))
        }
        return false
      }

      if (name === 'HTMLBlock') {
        if (node.from < coveredTo) return false
        const region = htmlRegion(state, node.node)
        if (region.from < coveredTo) return false
        coveredTo = region.to
        const from = doc.lineAt(region.from).from
        const to = doc.lineAt(region.to).to
        const html = renderFragment(doc.sliceString(from, to), docPath)
        if (html.replace(/\s+/g, '')) {
          addBlock(from, to, new RenderedHtmlWidget(html, Math.min(from + 1, to), true))
        }
        return false
      }

      return
    }
  })

  for (const def of footnotesOf(state)) {
    const body = renderFragment(def.content, docPath, true)
    const html = `<div class="cm-md-fn-def"><span class="fn-label">[${def.index}]</span><span class="fn-body">${body}</span></div>`
    addBlock(def.from, def.to, new RenderedHtmlWidget(html, Math.min(def.from + 1, def.to), false))
  }

  if (mode === 'ir') addImagePreviews(state, docPath, ranges)

  return Decoration.set(ranges, true)
}

function renderedBlocksField(mode: LiveMode, getDocPath: () => string | null, getTheme: () => LiveTheme) {
  return StateField.define<DecorationSet>({
    create: (state) => buildRenderedBlocks(state, mode, getDocPath, getTheme),
    update: (deco, tr) => {
      if (tr.docChanged || tr.selection || tr.effects.some((effect) => effect.is(REFRESH_BLOCKS))) {
        return buildRenderedBlocks(tr.state, mode, getDocPath, getTheme)
      }
      return deco.map(tr.changes)
    },
    provide: (field) => EditorView.decorations.from(field)
  })
}

/** 就地渲染：ir 模式当前行显示源码标记，wysiwyg 模式标记恒隐藏 */
export function livePreviewExtension(
  mode: LiveMode,
  getDocPath: () => string | null,
  getTheme: () => LiveTheme
) {
  const blocks = renderedBlocksField(mode, getDocPath, getTheme)
  const inline = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      private langSig: string
      private timer = 0

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, mode, getDocPath())
        this.langSig = fenceLanguages(view.state.doc.toString()).join(',')
        this.schedule(view, 0)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, mode, getDocPath())
        }
        if (update.docChanged) {
          const sig = fenceLanguages(update.state.doc.toString()).join(',')
          if (sig !== this.langSig) {
            this.langSig = sig
            this.schedule(update.view, 0)
          }
        }
      }

      // 语法树/Shiki 语言是异步就绪的：补齐后触发块级装饰重建
      schedule(view: EditorView, attempt: number): void {
        if (this.timer) window.clearTimeout(this.timer)
        this.timer = window.setTimeout(() => {
          this.timer = 0
          if (!view.dom.isConnected) return
          const tree = ensureSyntaxTree(view.state, view.state.doc.length, 300)
          const langs = fenceLanguages(view.state.doc.toString())
          const refresh = (): void => {
            if (view.dom.isConnected) view.dispatch({ effects: REFRESH_BLOCKS.of(null) })
          }
          if (langs.length > 0) void ensureLanguages(langs).then(refresh)
          else refresh()
          if (!tree && attempt < 8) {
            this.timer = window.setTimeout(() => this.schedule(view, attempt + 1), 250)
          }
        }, 30)
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
  return [blocks, inline]
}
