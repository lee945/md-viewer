import { useAppStore } from '@renderer/stores/app.store'

export default function Welcome() {
  const openDialog = useAppStore((s) => s.openDialog)

  return (
    <div className="welcome">
      <h1>MD Viewer</h1>
      <p>轻量、本地优先的 Markdown 阅读器</p>
      <button type="button" className="welcome-open" onClick={() => void openDialog()}>
        打开 Markdown 文件
      </button>
      <ul className="welcome-hints">
        <li>Ctrl + O 打开文件</li>
        <li>把 .md 文件拖进窗口</li>
        <li>双击 .md 文件用 MD Viewer 打开（文件关联在 Phase 4 启用）</li>
      </ul>
    </div>
  )
}
