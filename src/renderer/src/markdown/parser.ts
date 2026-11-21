import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import { resolveRelative, toAssetUrl } from './paths'

export interface MarkdownEnv {
  docPath: string
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function createParser(): InstanceType<typeof MarkdownIt> {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true,
    typographer: false
  })

  md.use(taskLists, { enabled: true, label: true })
  md.use(footnote)

  md.core.ruler.push('heading-ids', (state) => {
    const used = new Map<string, number>()
    for (let i = 0; i < state.tokens.length; i++) {
      if (state.tokens[i].type !== 'heading_open') continue
      const inline = state.tokens[i + 1]
      const base = slugify(inline?.content ?? '') || 'section'
      const count = used.get(base) ?? 0
      used.set(base, count + 1)
      state.tokens[i].attrSet('id', count === 0 ? base : `${base}-${count}`)
    }
  })

  const defaultImage =
    md.renderer.rules.image ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const srcValue = token.attrGet('src')
    const src = typeof srcValue === 'string' ? srcValue : null
    const docPath = (env as MarkdownEnv | undefined)?.docPath

    if (src && docPath && !/^[a-zA-Z][\w+.-]*:/.test(src) && !src.startsWith('//')) {
      const absolute = resolveRelative(docPath, src)
      if (absolute) token.attrSet('src', toAssetUrl(absolute))
    }
    token.attrSet('loading', 'lazy')

    return defaultImage(tokens, idx, options, env, self)
  }

  const defaultLink =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const hrefValue = tokens[idx].attrGet('href')
    const href = typeof hrefValue === 'string' ? hrefValue : null
    if (href && /^https?:/i.test(href)) {
      tokens[idx].attrSet('rel', 'noopener noreferrer')
    }
    return defaultLink(tokens, idx, options, env, self)
  }

  return md
}

export const md = createParser()
