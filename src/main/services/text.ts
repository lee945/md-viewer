import fs from 'node:fs/promises'
import path from 'node:path'
import iconv from 'iconv-lite'
import jschardet from 'jschardet'
import type { FileInfo } from '../../shared/types'

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
    size: buf.byteLength
  }
}
