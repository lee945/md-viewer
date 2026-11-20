import fs from 'node:fs/promises'
import path from 'node:path'
import { setAssetRoot } from './assets'

let workspaceRoot: string | null = null

export function getWorkspaceRoot(): string | null {
  return workspaceRoot
}

/** 工作区根同时是图片资源授权根，两者始终一致 */
export function applyWorkspace(root: string | null): void {
  workspaceRoot = root ? path.resolve(root) : null
  setAssetRoot(workspaceRoot)
}

export function isInsideWorkspace(target: string): boolean {
  if (!workspaceRoot) return false
  const rel = path.relative(workspaceRoot, path.resolve(target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export async function resolveExistingDir(input: string): Promise<string> {
  const resolved = path.resolve(input)
  const stat = await fs.stat(resolved)
  if (!stat.isDirectory()) {
    throw Object.assign(new Error('所选路径不是文件夹'), { code: 'ENOTDIR' })
  }
  // 无读取权限时在此抛出 EACCES，避免打开一个读不了的工作区
  await fs.readdir(resolved)
  return resolved
}
