import Outline from './Outline'
import FileTree from './FileTree'
import { useAppStore } from '@renderer/stores/app.store'

export default function Sidebar() {
  const tab = useAppStore((s) => s.sidebarTab)
  const setTab = useAppStore((s) => s.setSidebarTab)

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'outline'}
          className={tab === 'outline' ? 'active' : ''}
          onClick={() => setTab('outline')}
        >
          大纲
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'files'}
          className={tab === 'files' ? 'active' : ''}
          onClick={() => setTab('files')}
        >
          文件
        </button>
      </div>
      <div className="sidebar-body">{tab === 'outline' ? <Outline /> : <FileTree />}</div>
    </aside>
  )
}
