import { useAppStore } from '@renderer/stores/app.store'

export default function Outline() {
  const outline = useAppStore((s) => s.outline)
  const activeId = useAppStore((s) => s.activeId)

  return (
    <aside className="outline">
      <div className="outline-header">大纲</div>
      {outline.length === 0 ? (
        <p className="outline-empty">本文档没有标题</p>
      ) : (
        <nav>
          {outline.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`outline-item level-${item.level}${item.id === activeId ? ' active' : ''}`}
              title={item.text}
              onClick={() => {
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              {item.text}
            </button>
          ))}
        </nav>
      )}
    </aside>
  )
}
