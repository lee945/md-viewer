import { jumpToOutline, useAppStore } from '@renderer/stores/app.store'

export default function Outline() {
  const outline = useAppStore((s) => s.outline)
  const activeId = useAppStore((s) => s.activeId)
  const viewMode = useAppStore((s) => s.viewMode)

  if (outline.length === 0) {
    return <p className="outline-empty">本文档没有标题</p>
  }

  return (
    <nav>
      {outline.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`outline-item level-${item.level}${item.id === activeId ? ' active' : ''}`}
          title={item.text}
          onClick={() => {
            if (viewMode !== 'split' && jumpToOutline(item.id)) return
            document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          {item.text}
        </button>
      ))}
    </nav>
  )
}
