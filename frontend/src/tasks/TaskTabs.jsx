import { forwardRef, useImperativeHandle, useRef } from 'react'

const STATUSES = ['ACTIVE', 'COMPLETED']

const TaskTabs = forwardRef(function TaskTabs({ selected, counts, onSelect }, ref) {
  const tabs = useRef({})

  useImperativeHandle(ref, () => ({
    focus(status) { tabs.current[status]?.focus() },
  }))

  function selectFromKeyboard(event, status) {
    const index = STATUSES.indexOf(status)
    let next
    if (event.key === 'ArrowRight') next = STATUSES[(index + 1) % STATUSES.length]
    else if (event.key === 'ArrowLeft') next = STATUSES[(index - 1 + STATUSES.length) % STATUSES.length]
    else if (event.key === 'Home') next = STATUSES[0]
    else if (event.key === 'End') next = STATUSES[STATUSES.length - 1]
    else return
    event.preventDefault()
    onSelect(next)
    tabs.current[next]?.focus()
  }

  return (
    <div className="tabs" role="tablist" aria-label="Task views">
      {STATUSES.map((status) => {
        const label = status === 'ACTIVE' ? 'Active' : 'Completed'
        const count = status === 'ACTIVE' ? counts.active : counts.completed
        const slug = status.toLowerCase()
        return (
          <button
            key={status}
            ref={(node) => { tabs.current[status] = node }}
            id={`task-tab-${slug}`}
            type="button"
            role="tab"
            aria-selected={selected === status}
            aria-controls={`task-panel-${slug}`}
            tabIndex={selected === status ? 0 : -1}
            onClick={() => onSelect(status)}
            onKeyDown={(event) => selectFromKeyboard(event, status)}
          >
            {label} ({count})
          </button>
        )
      })}
    </div>
  )
})

export default TaskTabs
