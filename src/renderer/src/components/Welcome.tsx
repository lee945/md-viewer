import type { RecentEntry } from '@shared/types'
import { baseName, dirname } from '@renderer/markdown/paths'
import { useAppStore } from '@renderer/stores/app.store'

const RECENT_SHOWN = 8

interface RecentListProps {
  title: string
  entries: RecentEntry[]
  onPick(path: string): void
}

function RecentList({ title, entries, onPick }: RecentListProps) {
  if (entries.length === 0) return null
  return (
    <section className="recent">
      <h2>{title}</h2>
      {entries.slice(0, RECENT_SHOWN).map((entry) => (
        <button
          key={entry.path}
          type="button"
          className="recent-item"
          title={entry.path}
          onClick={() => onPick(entry.path)}
        >
          <span className="recent-name">{baseName(entry.path)}</span>
          <span className="recent-dir">{dirname(entry.path)}</span>
        </button>
      ))}
    </section>
  )
}

export default function Welcome() {
  const openDialog = useAppStore((s) => s.openDialog)
  const openWorkspaceDialog = useAppStore((s) => s.openWorkspaceDialog)
  const recentFiles = useAppStore((s) => s.recentFiles)
  const recentWorkspaces = useAppStore((s) => s.recentWorkspaces)
  const openRecentFile = useAppStore((s) => s.openRecentFile)
  const openRecentWorkspace = useAppStore((s) => s.openRecentWorkspace)

  return (
    <div className="welcome">
      <h1>MD Viewer</h1>
      <p>轻量、本地优先的 Markdown 阅读器</p>
      <div className="welcome-actions">
        <button type="button" className="welcome-open" onClick={() => void openDialog()}>
          打开 Markdown 文件
        </button>
        <button
          type="button"
          className="welcome-open secondary"
          onClick={() => void openWorkspaceDialog()}
        >
          打开文件夹
        </button>
      </div>
      <ul className="welcome-hints">
        <li>Ctrl + O 打开文件 · Ctrl + Shift + O 打开文件夹</li>
        <li>把 .md 文件拖进窗口</li>
        <li>双击 .md 文件用 MD Viewer 打开（文件关联在 Phase 4 启用）</li>
      </ul>
      <RecentList
        title="最近文件"
        entries={recentFiles}
        onPick={(path) => void openRecentFile(path)}
      />
      <RecentList
        title="最近工作区"
        entries={recentWorkspaces}
        onPick={(path) => void openRecentWorkspace(path)}
      />
    </div>
  )
}
