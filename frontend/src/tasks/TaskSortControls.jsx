const KEYS = {
  ACTIVE: [
    ['createdAt', 'Creation date'],
    ['priority', 'Priority'],
    ['title', 'Title'],
  ],
  COMPLETED: [
    ['completedAt', 'Completion date'],
    ['createdAt', 'Creation date'],
    ['title', 'Title'],
  ],
}

function directionLabels(key) {
  if (key === 'title') return [['asc', 'A–Z'], ['desc', 'Z–A']]
  if (key === 'priority') return [['asc', 'Highest first'], ['desc', 'Lowest first']]
  return [['desc', 'Newest first'], ['asc', 'Oldest first']]
}

export default function TaskSortControls({ status, value, disabled, onChange }) {
  const label = status === 'ACTIVE' ? 'Active' : 'Completed'
  return (
    <div className="sort-controls" aria-label={`${label} task sorting`}>
      <div className="sort-field">
        <label htmlFor={`task-sort-${status.toLowerCase()}`}>Sort {label} tasks by</label>
        <select
          id={`task-sort-${status.toLowerCase()}`}
          value={value.key}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, key: event.target.value })}
        >
          {KEYS[status].map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </select>
      </div>
      <div className="sort-field">
        <label htmlFor={`task-direction-${status.toLowerCase()}`}>{label} sort direction</label>
        <select
          id={`task-direction-${status.toLowerCase()}`}
          value={value.direction}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, direction: event.target.value })}
        >
          {directionLabels(value.key).map(([direction, text]) => <option key={direction} value={direction}>{text}</option>)}
        </select>
      </div>
    </div>
  )
}
