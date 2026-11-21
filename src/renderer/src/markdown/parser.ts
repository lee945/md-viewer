import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import { resolveRelative, toAssetUrl } from './paths'
import { uniqueHeadingId } from './slug'

export interface MarkdownEnv {
  docPath: string
}

const LINE_ATTR_TYPES = new Set([
  'heading_open',
  'paragraph_open',
  'blockquote_open',
  'list_item_open',
  'table_open',
  'hr',
  'fence',
  'code_block'
])

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
      state.tokens[i].attrSet('id', uniqueHeadingId(used, inline?.content ?? ''))
    }
  })

  // 给块级 token 标注源码行范围，供分屏滚动同步做位置映射
  md.core.ruler.push('block-line-attrs', (state) => {
    for (const token of state.tokens) {
      if (!token.map || !LINE_ATTR_TYPES.has(token.type)) continue
      token.attrSet('data-line-start', String(token.map[0] + 1))
      token.attrSet('data-line-end', String(token.map[1] + 1))
    }
  })

  // fence/code_block 的默认渲染不输出 token 属性，需要手工注入到 <pre>
  for (const rule of ['fence', 'code_block'] as const) {
    const original = md.renderer.rules[rule]
    if (!original) continue
    md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
      const start = tokens[idx].attrGet('data-line-start')
      const end = tokens[idx].attrGet('data-line-end')
      const html = original(tokens, idx, options, env, self)
      if (start === null || end === null) return html
      return html.replace('<pre', `<pre data-line-start="${start}" data-line-end="${end}"`)
    }
  }

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
