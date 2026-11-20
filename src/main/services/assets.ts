import { protocol } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

let allowedRoot: string | null = null

export function setAssetRoot(dir: string): void {
  allowedRoot = path.resolve(dir)
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export function registerAssetProtocol(): void {
  protocol.handle('md-asset', async (request) => {
    try {
      const url = new URL(request.url)
      const rawPath = url.searchParams.get('p')
      if (!rawPath || !allowedRoot) {
        return new Response('not found', { status: 404 })
      }

      const target = path.resolve(rawPath)
      if (!isInside(allowedRoot, target)) {
        return new Response('forbidden', { status: 403 })
      }

      // 符号链接可能指向工作区外，按真实路径再校验一次
      const realRoot = await fs.realpath(allowedRoot)
      const realTarget = await fs.realpath(target)
      if (!isInside(realRoot, realTarget)) {
        return new Response('forbidden', { status: 403 })
      }

      const data = await fs.readFile(realTarget)
      const mime = MIME[path.extname(realTarget).toLowerCase()] ?? 'application/octet-stream'
      return new Response(new Uint8Array(data), {
        headers: { 'content-type': mime, 'cache-control': 'no-cache' }
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}
