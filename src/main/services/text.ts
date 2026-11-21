import fs from 'node:fs/promises'
import path from 'node:path'
import iconv from 'iconv-lite'
import jschardet from 'jschardet'
import type { FileInfo, SaveMeta } from '../../shared/types'

interface Decoded {
  text: string
  encoding: string
  hasBOM: boolean
}

const KNOWN_ICONV = new Set([
  'gb18030',
  'gbk',
  'gb2312',
  'big5',
  'shift_jis',
  'euc-jp',
  'euc-kr',
  'cp1252',
  'iso-8859-1'
])

function mapDetected(raw: string): string | null {
  const enc = raw.toLowerCase()
  if (!enc) return null
  if (enc.includes('gb') || enc.includes('gb2312')) return 'gb18030'
  if (enc.includes('big5')) return 'big5'
  if (enc.includes('shift')) return 'shift_jis'
  if (enc.includes('euc-jp')) return 'euc-jp'
  if (enc.includes('euc-kr')) return 'euc-kr'
  if (enc.includes('utf-16')) return 'utf16le'
  if (KNOWN_ICONV.has(enc)) return enc
  return null
}

function decodeBuffer(buf: Buffer): Decoded {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString('utf8'), encoding: 'utf8', hasBOM: true }
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: iconv.decode(buf.subarray(2), 'utf16le'), encoding: 'utf16le', hasBOM: true }
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { text: iconv.decode(buf.subarray(2), 'utf16be'), encoding: 'utf16be', hasBOM: true }
  }

  const utf8 = buf.toString('utf8')
  if (!utf8.includes('�')) {
    return { text: utf8, encoding: 'utf8', hasBOM: false }
  }

  let detected: string | null = null
  try {
    detected = mapDetected(String(jschardet.detect(buf)?.encoding ?? ''))
  } catch {
    detected = null
  }

  for (const enc of [detected, 'gb18030']) {
    if (!enc || !iconv.encodingExists(enc)) continue
    try {
      const text = iconv.decode(buf, enc)
      if (!text.includes('�')) return { text, encoding: enc, hasBOM: false }
    } catch {
      // 尝试下一个候选编码
    }
  }

  return { text: utf8, encoding: 'utf8', hasBOM: false }
}

function detectLineEnding(text: string): 'LF' | 'CRLF' {
  return text.includes('\r\n') ? 'CRLF' : 'LF'
}

export async function readMarkdownFile(filePath: string): Promise<FileInfo> {
  const resolved = path.resolve(filePath)
  const stat = await fs.stat(resolved)
  if (!stat.isFile()) throw new Error('不是文件：' + resolved)

  const buf = await fs.readFile(resolved)
  const decoded = decodeBuffer(buf)

  return {
    path: resolved,
    content: decoded.text,
    encoding: decoded.encoding,
    hasBOM: decoded.hasBOM,
    lineEnding: detectLineEnding(decoded.text),
    size: buf.byteLength,
    mtime: stat.mtimeMs
  }
}

const BOM_BYTES: Record<string, Buffer> = {
  utf8: Buffer.from([0xef, 0xbb, 0xbf]),
  utf16le: Buffer.from([0xff, 0xfe]),
  utf16be: Buffer.from([0xfe, 0xff])
}

function encodeContent(content: string, meta: SaveMeta): Buffer {
  if (meta.encoding !== 'utf8' && !iconv.encodingExists(meta.encoding)) {
    throw new Error('不支持的编码：' + meta.encoding)
  }
  const normalized = content.replace(/\r\n?/g, '\n')
  const text = meta.lineEnding === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized
  const body = meta.encoding === 'utf8' ? Buffer.from(text, 'utf8') : iconv.encode(text, meta.encoding)
  const bom = meta.hasBOM ? BOM_BYTES[meta.encoding] : undefined
  return bom ? Buffer.concat([bom, body]) : body
}

/** 写入失败时把 errno 挂到 Error 上，复用主进程统一错误码映射 */
function withCode(message: string, code: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException
  err.code = code
  return err
}

/**
 * 按原编码/BOM/行尾写回，先写同目录临时文件再 rename，避免半截文件。
 * expectedMtime 用于防止覆盖外部已修改的内容。
 */
export async function writeMarkdownFile(
  filePath: string,
  content: string,
  meta: SaveMeta,
  expectedMtime?: number
): Promise<FileInfo> {
  const resolved = path.resolve(filePath)
  const stat = await fs.stat(resolved)
  if (!stat.isFile()) throw new Error('不是文件：' + resolved)
  if (expectedMtime !== undefined && Math.abs(stat.mtimeMs - expectedMtime) > 1) {
    throw withCode('文件已在外部修改，请先处理冲突', 'ECONFLICT')
  }

  const buf = encodeContent(content, meta)
  // 目标编码可能无法表示部分字符（iconv 会静默替换为 ?），回读一致才落盘
  const bomLength = meta.hasBOM ? (BOM_BYTES[meta.encoding]?.length ?? 0) : 0
  const body = buf.subarray(bomLength)
  const decodedBack = meta.encoding === 'utf8' ? body.toString('utf8') : iconv.decode(body, meta.encoding)
  const normalized = content.replace(/\r\n?/g, '\n')
  const expected = meta.lineEnding === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized
  if (decodedBack !== expected) {
    throw new Error('当前编码无法完整保存内容（可能包含无法表示的字符）')
  }

  const tmp = path.join(
    path.dirname(resolved),
    `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`
  )
  try {
    await fs.writeFile(tmp, buf)
    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fs.rename(tmp, resolved)
        lastError = null
        break
      } catch (err) {
        lastError = err
        const code = (err as NodeJS.ErrnoException).code
        if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') break
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
      }
    }
    if (lastError) throw lastError
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined)
    throw err
  }

  return readMarkdownFile(resolved)
}
