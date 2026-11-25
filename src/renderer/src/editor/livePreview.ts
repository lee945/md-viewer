import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { StateField, type EditorState, type Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { resolveRelative, toAssetUrl } from '@renderer/markdown/paths'

export type LiveMode = 'ir' | 'wysiwyg'

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

function resolveImage(src: string, docPath: string | null): string | null {
  if (!src) return null
  if (/^[a-zA-Z][\w+.-]*:/.test(src) || src.startsWith('//')) return src
  if (!docPath) return null
  const absolute = resolveRelative(docPath, src)
  return absolute ? toAssetUrl(absolute) : null
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

      if (name === 'Blockquote') {
        for (const mark of child.getChildren('QuoteMark')) {
          const lineFrom = doc.lineAt(mark.from).from
          if (!quoteLines.has(lineFrom)) {
            quoteLines.add(lineFrom)
            lineDeco(mark.from, 'cm-md-quote')
          }
          if (hideAllowed(mark.from)) hide(mark.from, mark.to)
        }
        return
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

/** 就地渲染：ir 模式当前行显示源码标记，wysiwyg 模式标记恒隐藏 */
export function livePreviewExtension(mode: LiveMode, getDocPath: () => string | null) {
  const inline = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, mode, getDocPath())
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, mode, getDocPath())
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
  return [blockPreviewField(mode, getDocPath), inline]
}

/**
 * 光标所在图片行下方的块级图片预览。
 * 块级装饰不允许由 ViewPlugin 提供（CodeMirror 限制），所以单独放在 StateField 里。
 */
function blockPreviewField(mode: LiveMode, getDocPath: () => string | null) {
  return StateField.define<DecorationSet>({
    create: (state) => buildBlockPreviews(state, mode, getDocPath()),
    update: (deco, tr) => {
      if (tr.docChanged || tr.selection) return buildBlockPreviews(tr.state, mode, getDocPath())
      return deco.map(tr.changes)
    },
    provide: (field) => EditorView.decorations.from(field)
  })
}

function buildBlockPreviews(
  state: EditorState,
  mode: LiveMode,
  docPath: string | null
): DecorationSet {
  if (mode !== 'ir') return Decoration.none
  const doc = state.doc
  const ranges: Range<Decoration>[] = []
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
          }).range(doc.lineAt(node.from).to)
        )
        return false
      }
    })
  }
  return Decoration.set(ranges, true)
}
