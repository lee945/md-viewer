import { useAppStore } from '@renderer/stores/app.store'

export default function Toolbar() {
  const file = useAppStore((s) => s.file)
  const theme = useAppStore((s) => s.theme)
  const openDialog = useAppStore((s) => s.openDialog)
  const openWorkspaceDialog = useAppStore((s) => s.openWorkspaceDialog)
  const toggleTheme = useAppStore((s) => s.toggleTheme)

  return (
    <header className="toolbar">
      <div className="toolbar-title">
        <span className="app-name">MD Viewer</span>
        {file && (
          <span className="file-name" title={file.path}>
            {file.path}
          </span>
        )}
      </div>
      <div className="toolbar-actions">
        <button type="button" onClick={() => void openDialog()} title="打开文件（Ctrl+O）">
          打开
        </button>
        <button
          type="button"
          onClick={() => void openWorkspaceDialog()}
          title="打开文件夹作为工作区（Ctrl+Shift+O）"
        >
          文件夹
        </button>
        <button type="button" onClick={toggleTheme} title="切换深色 / 浅色主题">
          {theme === 'dark' ? '浅色' : '深色'}
        </button>
      </div>
    </header>
  )
}
