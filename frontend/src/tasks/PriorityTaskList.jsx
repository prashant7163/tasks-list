import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { TaskCard } from './TaskList'

const PriorityTaskList = forwardRef(function PriorityTaskList({ tasks, disabled, onReorder, ...actions }, ref) {
  const [draggedId, setDraggedId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)
  const [message, setMessage] = useState('Ready to reorder.')
  const cards = useRef(new Map())
  const dropped = useRef(false)
  const dropTargetRef = useRef(null)

  useImperativeHandle(ref, () => ({
    focus(id) { cards.current.get(id)?.focus() },
  }))

  function dragStart(event, task) {
    if (disabled) return
    dropped.current = false
    setDraggedId(task.id)
    setMessage(`Picked up ${task.title}. Drag to a new position.`)
    event.dataTransfer?.setData('text/plain', String(task.id))
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function dragEnter(targetId) {
    if (disabled || draggedId === null || draggedId === targetId) return
    const to = tasks.findIndex((task) => task.id === targetId)
    if (to < 0) return
    dropTargetRef.current = targetId
    setDropTargetId(targetId)
    setMessage(`Drop at position ${to + 1}.`)
  }

  function drop(event) {
    event.preventDefault()
    if (disabled || draggedId === null) return
    dropped.current = true
    const next = [...tasks]
    const from = next.findIndex((task) => task.id === draggedId)
    const to = next.findIndex((task) => task.id === dropTargetRef.current)
    if (from < 0 || to < 0) return
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const orderedIds = next.map((task) => task.id)
    const unchanged = orderedIds.every((id, index) => id === tasks[index]?.id)
    if (unchanged) {
      setMessage('Priority unchanged.')
      setDraggedId(null)
      setDropTargetId(null)
      return
    }
    setMessage('Saving priority order…')
    onReorder(orderedIds, draggedId, setMessage)
    setDraggedId(null)
    setDropTargetId(null)
  }

  function dragEnd() {
    if (!dropped.current && draggedId !== null) {
      setMessage('Reorder cancelled. Priority is unchanged.')
    }
    setDraggedId(null)
    setDropTargetId(null)
    dropTargetRef.current = null
  }

  return (
    <div>
      <p className="reorder-help">Drag tasks to change priority. Mouse only.</p>
      <p className="reorder-status" role="status" aria-label="Reorder status" aria-live="polite">{message}</p>
      <div className={`task-list priority-list ${disabled ? 'pending' : ''}`} aria-busy={disabled}>
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`priority-item ${draggedId === task.id ? 'dragging' : ''} ${dropTargetId === task.id ? 'drop-target' : ''}`}
            draggable={!disabled}
            onDragStart={(event) => dragStart(event, task)}
            onDragEnter={() => dragEnter(task.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={drop}
            onDragEnd={dragEnd}
          >
            <span className="drag-handle" aria-hidden="true">⋮⋮</span>
            <TaskCard ref={(node) => { if (node) cards.current.set(task.id, node); else cards.current.delete(task.id) }} task={task} status="ACTIVE" disabled={disabled} dragEnabled={!disabled} {...actions} />
          </div>
        ))}
      </div>
    </div>
  )
})

export default PriorityTaskList
