import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '@renderer/markdown/render'
import { resolveRelative, toAssetUrl } from '@renderer/markdown/paths'

const DOC = 'C:\\docs\\readme.md'

describe('renderMarkdown', () => {
  it('渲染 GFM 表格与任务列表', async () => {
    const source = ['| a | b |', '| --- | --- |', '| 1 | 2 |', '', '- [x] 完成', '- [ ] 未完成'].join('\n')
    const html = await renderMarkdown(source, { docPath: DOC, preset: 'github', scheme: 'light' })
    expect(html).toContain('<table>')
    expect(html).toContain('type="checkbox"')
  })

  it('把相对图片路径改写为 md-asset 协议', async () => {
    const html = await renderMarkdown('![图](./assets/a.png)', { docPath: DOC, preset: 'github', scheme: 'light' })
    expect(html).toContain('md-asset://local/?p=')
    expect(html).toContain(encodeURIComponent('C:\\docs\\assets\\a.png'))
  })

  it('拒绝 script 与内联事件', async () => {
    const html = await renderMarkdown('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">', {
      docPath: DOC,
      preset: 'github',
      scheme: 'light'
    })
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
  })

  it('为标题生成唯一 id', async () => {
    const html = await renderMarkdown('# 标题\n\n## 标题', { docPath: DOC, preset: 'github', scheme: 'light' })
    expect(html).toContain('id="标题"')
    expect(html).toContain('id="标题-1"')
  })

  it('代码块使用 Shiki 高亮', async () => {
    const html = await renderMarkdown('```js\nconst a = 1\n```', { docPath: DOC, preset: 'github', scheme: 'dark' })
    expect(html.toLowerCase()).toContain('shiki')
  })

  it('未加载语言时降级为普通代码块', async () => {
    const html = await renderMarkdown('```not-a-language\nhello\n```', { docPath: DOC, preset: 'github', scheme: 'light' })
    expect(html).toContain('<pre><code')
    expect(html).toContain('hello')
  })
})

describe('路径解析', () => {
  it('解析相对路径', () => {
    expect(resolveRelative(DOC, './assets/a.png')).toBe('C:\\docs\\assets\\a.png')
    expect(resolveRelative(DOC, '../img/a.png')).toBe('C:\\img\\a.png')
    expect(resolveRelative(DOC, '/abs/a.png')).toBe('C:\\abs\\a.png')
  })

  it('忽略带协议或锚点的地址', () => {
    expect(resolveRelative(DOC, 'https://example.com/a.png')).toBeNull()
    expect(resolveRelative(DOC, '#section')).toBeNull()
  })

  it('生成 md-asset URL', () => {
    expect(toAssetUrl('C:\\a b\\c.png')).toBe('md-asset://local/?p=' + encodeURIComponent('C:\\a b\\c.png'))
  })
})
