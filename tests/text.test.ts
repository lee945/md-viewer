import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import iconv from 'iconv-lite'
import { readMarkdownFile, writeMarkdownFile } from '../src/main/services/text'
import type { SaveMeta } from '../src/shared/types'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'mdv-text-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function target(name = 'a.md'): string {
  return path.join(dir, name)
}

function saveMeta(over: Partial<SaveMeta> = {}): SaveMeta {
  return { encoding: 'utf8', hasBOM: false, lineEnding: 'LF', ...over }
}

describe('writeMarkdownFile', () => {
  it('UTF-8 LF 原样写回', async () => {
    const file = target()
    await writeFile(file, '# 标题\n正文\n', 'utf8')
    const before = await readMarkdownFile(file)
    const info = await writeMarkdownFile(
      file,
      '# 新标题\n正文\n',
      saveMeta({ encoding: before.encoding, hasBOM: before.hasBOM, lineEnding: before.lineEnding }),
      before.mtime
    )
    expect(info.content).toBe('# 新标题\n正文\n')
    expect((await readFile(file)).toString('utf8')).toBe('# 新标题\n正文\n')
    expect(info.mtime).toBeGreaterThan(0)
  })

  it('保留 UTF-8 BOM', async () => {
    const file = target()
    await writeFile(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('旧内容\n', 'utf8')]))
    const before = await readMarkdownFile(file)
    expect(before.hasBOM).toBe(true)
    await writeMarkdownFile(file, '新内容\n', saveMeta({ hasBOM: true }), before.mtime)
    const raw = await readFile(file)
    expect([...raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(raw.subarray(3).toString('utf8')).toBe('新内容\n')
  })

  it('保留 CRLF 换行符', async () => {
    const file = target()
    await writeFile(file, '第一行\r\n第二行\r\n', 'utf8')
    const before = await readMarkdownFile(file)
    expect(before.lineEnding).toBe('CRLF')
    await writeMarkdownFile(file, '新一\n新二\n', saveMeta({ lineEnding: 'CRLF' }), before.mtime)
    expect((await readFile(file)).toString('utf8')).toBe('新一\r\n新二\r\n')
  })

  it('保留 GB18030 编码', async () => {
    const file = target()
    await writeFile(file, iconv.encode('旧中文\r\n', 'gb18030'))
    const before = await readMarkdownFile(file)
    expect(before.encoding).toBe('gb18030')
    const info = await writeMarkdownFile(
      file,
      '新中文\n第二行\n',
      saveMeta({ encoding: 'gb18030', lineEnding: 'CRLF' }),
      before.mtime
    )
    expect(info.encoding).toBe('gb18030')
    const raw = await readFile(file)
    expect(raw.equals(iconv.encode('新中文\r\n第二行\r\n', 'gb18030'))).toBe(true)
  })

  it('保留 UTF-16LE 与 UTF-16BE', async () => {
    for (const encoding of ['utf16le', 'utf16be'] as const) {
      const file = target(`${encoding}.md`)
      const bom = encoding === 'utf16le' ? [0xff, 0xfe] : [0xfe, 0xff]
      await writeFile(file, Buffer.concat([Buffer.from(bom), iconv.encode('旧\r\n', encoding)]))
      const before = await readMarkdownFile(file)
      expect(before.encoding).toBe(encoding)
      await writeMarkdownFile(file, '新内容\n', saveMeta({ encoding, hasBOM: true, lineEnding: 'CRLF' }), before.mtime)
      const raw = await readFile(file)
      const body = raw.subarray(2)
      expect(iconv.decode(body, encoding)).toBe('新内容\r\n')
    }
  })

  it('mtime 不一致时抛 ECONFLICT 且不写盘', async () => {
    const file = target()
    await writeFile(file, '原内容\n', 'utf8')
    const before = await readMarkdownFile(file)
    await expect(
      writeMarkdownFile(file, '新内容\n', saveMeta(), before.mtime - 5000)
    ).rejects.toMatchObject({ code: 'ECONFLICT' })
    expect((await readFile(file)).toString('utf8')).toBe('原内容\n')
  })

  it('编码无法表示内容时拒绝保存且无临时文件残留', async () => {
    const file = target()
    await writeFile(file, iconv.encode('旧\n', 'gb18030'))
    const before = await readMarkdownFile(file)
    await expect(
      writeMarkdownFile(file, '表情😀\n', saveMeta({ encoding: 'gbk' }), before.mtime)
    ).rejects.toThrow(/无法完整保存/)
    expect((await readFile(file)).toString('latin1')).toBe(iconv.encode('旧\n', 'gb18030').toString('latin1'))
    expect((await readdir(dir)).sort()).toEqual(['a.md'])
  })
})
