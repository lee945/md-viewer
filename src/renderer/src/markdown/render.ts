import { md } from './parser'
import { ensureLanguages, highlightCode } from './highlighter'
import { sanitizeHtml } from './sanitize'

export type RenderTheme = 'light' | 'dark'

let currentTheme: RenderTheme = 'light'

md.options.highlight = (code: string, lang: string): string => highlightCode(code, lang, currentTheme)

const FENCE_RE = /^ {0,3}(?:```|~~~)\s*([\w#+.-]+)?/gm

function collectFenceLanguages(source: string): string[] {
  const langs: string[] = []
  for (const match of source.matchAll(FENCE_RE)) {
    if (match[1]) langs.push(match[1])
  }
  return langs
}

export async function renderMarkdown(
  source: string,
  options: { docPath: string; theme: RenderTheme }
): Promise<string> {
  currentTheme = options.theme
  await ensureLanguages(collectFenceLanguages(source))
  const raw = md.render(source, { docPath: options.docPath })
  return sanitizeHtml(raw)
}
