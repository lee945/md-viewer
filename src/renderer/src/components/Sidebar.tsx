import Outline from './Outline'
import FileTree from './FileTree'
import { useAppStore } from '@renderer/stores/app.store'

export default function Sidebar() {
  const file = useAppStore((s) => s.file)
  const tab = useAppStore((s) => s.sidebarTab)
  const setTab = useAppStore((s) => s.setSidebarTab)
  // 没有文档时大纲无意义，强制显示文件树（不写回持久化）
  const active = file ? tab : 'files'

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={active === 'outline'}
          className={active === 'outline' ? 'active' : ''}
          onClick={() => setTab('outline')}
        >
          大纲
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === 'files'}
          className={active === 'files' ? 'active' : ''}
          onClick={() => setTab('files')}
        >
          文件
        </button>
      </div>
      <div className="sidebar-body">{active === 'outline' ? <Outline /> : <FileTree />}</div>
    </aside>
  )
}
