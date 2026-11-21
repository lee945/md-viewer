import { createHighlighter, type BundledTheme, type Highlighter } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { THEMES, type ThemePreset } from '@shared/themes'
import type { ColorScheme } from '@shared/types'

const SHIKI_THEMES = Object.values(THEMES).flatMap((t) => [t.shiki.light, t.shiki.dark])

const ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  yml: 'yaml',
  py: 'python',
  ps1: 'powershell',
  ps: 'powershell',
  pwsh: 'powershell',
  htm: 'html',
  md: 'markdown',
  'c++': 'cpp',
  cs: 'csharp',
  rs: 'rust',
  golang: 'go',
  kt: 'kotlin',
  rb: 'ruby'
}

export function normalizeLang(lang: string | null | undefined): string | null {
  if (!lang) return null
  const key = lang.trim().toLowerCase()
  if (!key) return null
  return ALIASES[key] ?? key
}

let highlighter: Highlighter | null = null
let initPromise: Promise<Highlighter> | null = null
const loading = new Map<string, Promise<void>>()

type LangId = Parameters<Highlighter['loadLanguage']>[0]

function init(): Promise<Highlighter> {
  if (!initPromise) {
    initPromise = createHighlighter({
      themes: SHIKI_THEMES as BundledTheme[],
      langs: [],
      engine: createJavaScriptRegexEngine()
    }).then((hl) => {
      highlighter = hl
      return hl
    })
  }
  return initPromise
}

export async function ensureLanguages(langs: string[]): Promise<void> {
  const hl = await init()
  const loaded = new Set(hl.getLoadedLanguages())
  const wanted = new Set<string>()

  for (const lang of langs) {
    const id = normalizeLang(lang)
    if (id && !loaded.has(id)) wanted.add(id)
  }

  await Promise.all(
    [...wanted].map(async (id) => {
      let task = loading.get(id)
      if (!task) {
        // loadLanguage 对未知语言会同步抛错，放进 Promise 链里统一降级
        task = Promise.resolve()
          .then(() => hl.loadLanguage(id as LangId))
          .then(() => undefined)
          .catch(() => undefined)
        loading.set(id, task)
      }
      await task
    })
  )
}

export function highlightCode(
  code: string,
  lang: string | null | undefined,
  preset: ThemePreset,
  scheme: ColorScheme
): string {
  if (!lang || !highlighter) return ''
  const id = normalizeLang(lang)
  if (!id || !highlighter.getLoadedLanguages().includes(id)) return ''

  try {
    return highlighter.codeToHtml(code, {
      lang: id,
      theme: THEMES[preset].shiki[scheme] as BundledTheme
    })
  } catch {
    return ''
  }
}
