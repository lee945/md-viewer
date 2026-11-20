import fs from 'node:fs/promises'
import path from 'node:path'
import type { DirEntry } from '../../shared/types'

const MARKDOWN_EXT = /\.(md|markdown|mdown|mkd|txt)$/i

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export async function listDirectory(root: string, dir: string): Promise<DirEntry[]> {
  const resolvedDir = path.resolve(dir)
  const resolvedRoot = path.resolve(root)
  if (resolvedDir !== resolvedRoot && !isInside(resolvedRoot, resolvedDir)) {
    throw new Error('目录超出工作区范围')
  }

  const dirents = await fs.readdir(resolvedDir, { withFileTypes: true })
  const entries: DirEntry[] = []

  for (const dirent of dirents) {
    if (dirent.name.startsWith('.')) continue
    const full = path.join(resolvedDir, dirent.name)
    if (dirent.isDirectory()) {
      entries.push({ name: dirent.name, path: full, isDir: true })
    } else if (dirent.isFile() && MARKDOWN_EXT.test(dirent.name)) {
      entries.push({ name: dirent.name, path: full, isDir: false })
    }
  }

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true })
  })
  return entries
}
