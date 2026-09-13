import { forwardRef } from 'react'

function date(value) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}

export const TaskCard = forwardRef(function TaskCard({ status, task, disabled, dragEnabled = false, onEdit, onDelete, onComplete, onReactivate }, ref) {
  return (
    <article ref={ref} tabIndex="-1" draggable={dragEnabled || undefined} className={`task-card ${status === 'COMPLETED' ? 'completed' : ''}`} aria-label={task.title}>
      {status === 'ACTIVE' && (
        <label className="complete-control">
          <input type="checkbox" aria-label={`Complete ${task.title}`} disabled={disabled} onChange={() => onComplete(task)} />
          <span>Complete</span>
        </label>
      )}
      <div className="task-content">
        <h2>{task.title}</h2>
        <p>{task.description}</p>
        <p className="task-meta">Created {date(task.createdAt)}</p>
        {status === 'COMPLETED' && <p className="task-meta">Completed {date(task.completedAt)}</p>}
      </div>
      <div className="task-actions">
        {status === 'ACTIVE' ? (
          <>
            <button className="text-button" type="button" onClick={() => onEdit(task)} disabled={disabled}>Edit <span className="sr-only">{task.title}</span></button>
            <button className="text-button destructive" type="button" onClick={(event) => onDelete(task, event.currentTarget)} disabled={disabled}>Delete <span className="sr-only">{task.title}</span></button>
          </>
        ) : (
          <button className="secondary" type="button" onClick={() => onReactivate(task)} disabled={disabled}>Reactivate</button>
        )}
      </div>
    </article>
  )
})

export default function TaskList({ status, tasks, disabled, onEdit, onDelete, onComplete, onReactivate }) {
  if (!tasks.length) return <p className="empty-copy">No {status === 'ACTIVE' ? 'active' : 'completed'} tasks yet.</p>

  return (
    <div className="task-list">
      {tasks.map((task) => <TaskCard key={task.id} task={task} status={status} disabled={disabled} onEdit={onEdit} onDelete={onDelete} onComplete={onComplete} onReactivate={onReactivate} />)}
    </div>
  )
}
