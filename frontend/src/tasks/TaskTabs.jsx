export default function TaskTabs({ selected, counts, onSelect }) {
  return (
    <div className="tabs" role="tablist" aria-label="Task views">
      {['ACTIVE', 'COMPLETED'].map((status) => {
        const label = status === 'ACTIVE' ? 'Active' : 'Completed'
        const count = status === 'ACTIVE' ? counts.active : counts.completed
        return (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={selected === status}
            aria-controls="task-panel"
            onClick={() => onSelect(status)}
          >
            {label} ({count})
          </button>
        )
      })}
    </div>
  )
}
