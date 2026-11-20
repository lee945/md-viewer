import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { DirEntry } from '@shared/types'
import { dirname } from '@renderer/markdown/paths'
import { useAppStore } from '@renderer/stores/app.store'

interface DirNode {
  entries?: DirEntry[]
  error?: string
}

function baseName(dirPath: string): string {
  const parts = dirPath.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? dirPath
}

export default function FileTree() {
  const file = useAppStore((s) => s.file)
  const openPath = useAppStore((s) => s.openPath)
  const root = file ? dirname(file.path) : ''
  const [cache, setCache] = useState<Record<string, DirNode>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const loadDir = useCallback(async (dirPath: string) => {
    const result = await window.api.listDir(dirPath)
    setCache((prev) => ({
      ...prev,
      [dirPath]: result.ok ? { entries: result.data } : { error: result.error }
    }))
  }, [])

  useEffect(() => {
    setCache({})
    setExpanded(new Set())
    if (root) void loadDir(root)
  }, [root, loadDir])

  if (!file) return null

  const toggle = (entry: DirEntry): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(entry.path)) {
        next.delete(entry.path)
      } else {
        next.add(entry.path)
        if (!cache[entry.path]) void loadDir(entry.path)
      }
      return next
    })
  }

  const refresh = (): void => {
    setCache({})
    void loadDir(root)
    for (const dirPath of expanded) void loadDir(dirPath)
  }

  const hint = (dirPath: string, depth: number, text: string, isError = false): ReactNode => (
    <div
      key={`${dirPath}-${text}`}
      className={`tree-hint${isError ? ' error' : ''}`}
      style={{ paddingLeft: 22 + depth * 14 }}
      title={isError ? text : undefined}
    >
      {text}
    </div>
  )

  const renderDir = (dirPath: string, depth: number): ReactNode => {
    const node = cache[dirPath]
    if (!node) return hint(dirPath, depth, '加载中…')
    if (node.error) return hint(dirPath, depth, node.error, true)
    const entries = node.entries ?? []
    if (entries.length === 0) return hint(dirPath, depth, '空目录')

    return entries.map((entry) => {
      if (entry.isDir) {
        const open = expanded.has(entry.path)
        return (
          <div key={entry.path}>
            <button
              type="button"
              className="tree-row"
              style={{ paddingLeft: 6 + depth * 14 }}
              title={entry.path}
              onClick={() => toggle(entry)}
            >
              <span className="tree-caret">{open ? '▾' : '▸'}</span>
              <span className="tree-name">{entry.name}</span>
            </button>
            {open && renderDir(entry.path, depth + 1)}
          </div>
        )
      }
      return (
        <button
          key={entry.path}
          type="button"
          className={`tree-row tree-file${entry.path === file.path ? ' active' : ''}`}
          style={{ paddingLeft: 22 + depth * 14 }}
          title={entry.path}
          onClick={() => void openPath(entry.path)}
        >
          <span className="tree-name">{entry.name}</span>
        </button>
      )
    })
  }

  return (
    <div className="tree">
      <div className="tree-root">
        <span className="tree-root-name" title={root}>
          {baseName(root)}
        </span>
        <button type="button" className="tree-refresh" title="刷新" onClick={refresh}>
          ⟳
        </button>
      </div>
      {renderDir(root, 0)}
    </div>
  )
}
