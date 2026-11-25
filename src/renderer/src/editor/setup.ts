import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap
} from '@codemirror/autocomplete'
import { HighlightStyle, ensureSyntaxTree, syntaxTree, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import type { SyntaxNode } from '@lezer/common'
import type { ViewMode } from '@shared/types'
import { livePreviewExtension, type LiveTheme } from './livePreview'

export interface EditorHandlers {
  onChange(doc: string): void
  onSave(doc: string): void
}

export interface EditorOptions {
  viewMode: ViewMode
  getDocPath: () => string | null
  getTheme: () => LiveTheme
}

/** 就地渲染开关随显示模式切换，用 Compartment 热重配 */
export const livePreviewCompartment = new Compartment()

export function livePreviewFor(options: EditorOptions): Extension {
  if (options.viewMode === 'split') return []
  return livePreviewExtension(options.viewMode, options.getDocPath, options.getTheme)
}

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '700', fontSize: '1.35em' },
  { tag: tags.heading2, fontWeight: '700', fontSize: '1.2em' },
  { tag: tags.heading3, fontWeight: '700', fontSize: '1.1em' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--accent)' },
  { tag: tags.url, color: 'var(--text-muted)' },
  { tag: tags.monospace, backgroundColor: 'var(--code-bg)' },
  { tag: tags.meta, color: 'var(--text-muted)' },
  { tag: tags.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: tags.quote, color: 'var(--text-muted)' },
  { tag: tags.contentSeparator, color: 'var(--text-muted)' }
])

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 'var(--reading-font-size, 14px)'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: "var(--editor-font, 'Cascadia Mono', Consolas, 'Microsoft YaHei', monospace)",
    lineHeight: 'var(--reading-line-height, 1.6)',
    overflow: 'auto'
  },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border)'
  },
  // 当前行底色用半透明，避免盖住 z-index 为负的选区层
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 25%, transparent)' },
  // 图片行铺实底色：当前行高亮会裹成大色块，且点选图片时选区层会在透明圆角处透出方框
  // 源码显示状态除外——铺实底会盖住文字选区
  '.cm-activeLine.cm-md-image-line:not(.cm-md-image-src)': { backgroundColor: 'var(--bg)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bg-hover)', color: 'var(--text)' },
  // 选择器与 CodeMirror 默认焦点态同结构同特异性，确保覆盖默认浅紫选区色
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    {
      backgroundColor: 'color-mix(in srgb, var(--accent) 55%, transparent)'
    },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '.cm-panels': { backgroundColor: 'var(--bg-elevated)', color: 'var(--text)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 45%, transparent)'
  },
  '.cm-selectionMatch': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)'
  },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': {
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: '4px',
    padding: '2px 6px'
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text)'
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--bg-hover)',
    color: 'var(--text)'
  }
})

const CODE_BLOCK_RE = /^(?:FencedCode|CodeBlock|IndentedCode)$/

/**
 * 代码块行内的行首/行尾跳转。CM 默认的 End/Home 依赖几何测量
 * （编辑区右边缘 + posAndSideAtCoords），就地渲染的块装饰与居中阅读栏
 * 会让该点落到块外，把行边界算到下方的段落之后。这里直接按文档行取边界。
 */
function codeLineBoundary(view: EditorView, forward: boolean, extend = false): boolean {
  const state = view.state
  if (state.selection.ranges.length !== 1) return false
  const range = state.selection.main
  const tree = ensureSyntaxTree(state, range.head, 50) ?? syntaxTree(state)
  let node: SyntaxNode | null = tree.resolveInner(range.head, 1)
  while (node && !CODE_BLOCK_RE.test(node.name)) node = node.parent
  if (!node) return false
  const line = state.doc.lineAt(range.head)
  const head = forward ? line.to : line.from
  if (head === range.head) return false
  view.dispatch({
    selection: EditorSelection.range(extend ? range.anchor : head, head),
    scrollIntoView: true,
    userEvent: 'select'
  })
  return true
}

export function createEditorState(
  doc: string,
  handlers: EditorHandlers,
  options: EditorOptions
): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      closeBrackets(),
      autocompletion(),
      EditorView.lineWrapping,
      search({ top: true }),
      highlightSelectionMatches(),
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(markdownHighlight),
      livePreviewCompartment.of(livePreviewFor(options)),
      editorTheme,
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: (view) => {
            handlers.onSave(view.state.doc.toString())
            return true
          }
        }
      ]),
      keymap.of([
        { key: 'End', run: (view) => codeLineBoundary(view, true) },
        { key: 'Shift-End', run: (view) => codeLineBoundary(view, true, true) },
        { key: 'Home', run: (view) => codeLineBoundary(view, false) },
        { key: 'Shift-Home', run: (view) => codeLineBoundary(view, false, true) },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...completionKeymap,
        indentWithTab
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) handlers.onChange(update.state.doc.toString())
      })
    ]
  })
}
