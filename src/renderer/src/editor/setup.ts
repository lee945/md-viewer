import { Compartment, EditorState, type Extension } from '@codemirror/state'
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
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import type { ViewMode } from '@shared/types'
import { livePreviewExtension } from './livePreview'

export interface EditorHandlers {
  onChange(doc: string): void
  onSave(doc: string): void
}

export interface EditorOptions {
  viewMode: ViewMode
  getDocPath: () => string | null
}

/** 就地渲染开关随显示模式切换，用 Compartment 热重配 */
export const livePreviewCompartment = new Compartment()

export function livePreviewFor(options: EditorOptions): Extension {
  if (options.viewMode === 'split') return []
  return livePreviewExtension(options.viewMode, options.getDocPath)
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
