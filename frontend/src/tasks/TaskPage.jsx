import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api'
import DeleteTaskDialog from './DeleteTaskDialog'
import TaskForm from './TaskForm'
import TaskList from './TaskList'
import TaskTabs from './TaskTabs'

const EMPTY = { ACTIVE: [], COMPLETED: [] }

export default function TaskPage({ api, onSessionEnded }) {
  const [selected, setSelected] = useState('ACTIVE')
  const [lists, setLists] = useState(EMPTY)
  const [counts, setCounts] = useState({ active: 0, completed: 0 })
  const [loading, setLoading] = useState(true)
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState('')
  const [formTask, setFormTask] = useState(undefined)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteTask, setDeleteTask] = useState(null)
  const [pending, setPending] = useState(null)
  const retryRef = useRef(null)
  const tabsRef = useRef(null)
  const newTaskRef = useRef(null)
  const deleteReturnFocusRef = useRef(null)

  const load = useCallback(async (announce = true) => {
    setLoading(true)
    setError('')
    try {
      const [active, completed, nextCounts] = await Promise.all([
        api.list('ACTIVE'), api.list('COMPLETED'), api.counts(),
      ])
      setLists({ ACTIVE: active.tasks, COMPLETED: completed.tasks })
      setCounts(nextCounts)
      if (announce) setAnnouncement('Tasks loaded.')
      return true
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) onSessionEnded()
      else setError('Tasks could not be loaded. Please try again.')
      return false
    } finally {
      setLoading(false)
    }
  }, [api, onSessionEnded])

  useEffect(() => {
    const frame = requestAnimationFrame(() => load(false))
    return () => cancelAnimationFrame(frame)
  }, [load])
  useEffect(() => {
    if (error) retryRef.current?.focus()
  }, [error])

  function explainFailure(requestError) {
    if (requestError instanceof ApiError && requestError.status === 401) {
      onSessionEnded()
      return ''
    }
    if (requestError instanceof ApiError && requestError.status === 404) return 'This task was not found. Refresh the list and try again.'
    if (requestError instanceof ApiError && requestError.status === 409) return 'This task changed. Refresh the list and try again.'
    return 'The task action could not be completed. Please try again.'
  }

  function restoreDeleteFocus() {
    const target = deleteReturnFocusRef.current
    setDeleteTask(null)
    queueMicrotask(() => target?.focus())
  }

  async function mutate(task, pendingText, successText, operation, close, afterReconcile, closeOnFailure = false) {
    if (pending) return
    setPending({ id: task?.id ?? 'new', text: pendingText })
    setAnnouncement(pendingText)
    setError('')
    try {
      await operation()
      close?.()
      const reconciled = await load(false)
      if (reconciled) {
        setAnnouncement(successText)
        afterReconcile?.()
      }
      else {
        setAnnouncement('The change was saved, but task refresh failed.')
        setError('The change was saved, but the latest tasks could not be loaded. Retry to reconcile.')
      }
    } catch (requestError) {
      if (closeOnFailure) close?.()
      setError(explainFailure(requestError))
    } finally {
      setPending(null)
    }
  }

  const heading = selected === 'ACTIVE' ? 'Active tasks' : 'Completed tasks'

  return (
    <section className="task-shell" aria-labelledby="task-view-title">
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      {error && (
        <div className="alert action-message" role="alert">
          <span>{error}</span>
          <button ref={retryRef} className="secondary" type="button" onClick={() => load(true)}>Retry</button>
        </div>
      )}
      <TaskTabs ref={tabsRef} selected={selected} counts={counts} onSelect={(status) => { setSelected(status); setFormOpen(false); setDeleteTask(null) }} />
      <div className="task-heading">
        <div><p className="eyebrow">Private workspace</p><h1 id="task-view-title">{heading}</h1></div>
        {selected === 'ACTIVE' && !formOpen && <button ref={newTaskRef} className="primary compact" type="button" onClick={() => { setFormTask(undefined); setFormOpen(true) }}>New task</button>}
      </div>
      {formOpen && (
        <TaskForm
          key={formTask?.id ?? 'new'}
          task={formTask}
          pending={Boolean(pending)}
          onCancel={() => setFormOpen(false)}
          onSubmit={(values) => mutate(formTask, formTask ? 'Updating task…' : 'Creating task…', formTask ? 'Task updated.' : 'Task created.', () => formTask ? api.edit(formTask.id, values) : api.create(values), () => setFormOpen(false))}
        />
      )}
      {loading ? <p className="status" role="status">Loading tasks…</p> : ['ACTIVE', 'COMPLETED'].map((status) => (
        <div key={status} id={`task-panel-${status.toLowerCase()}`} role="tabpanel" aria-labelledby={`task-tab-${status.toLowerCase()}`} tabIndex="0" hidden={selected !== status}>
          <TaskList
            status={status}
            tasks={lists[status]}
            pendingId={pending?.id}
            onEdit={(task) => { setFormTask(task); setFormOpen(true) }}
            onDelete={(task, trigger) => { deleteReturnFocusRef.current = trigger; setDeleteTask(task) }}
            onComplete={(task) => mutate(task, 'Completing task…', 'Task completed.', () => api.complete(task.id), undefined, () => tabsRef.current?.focus(selected))}
            onReactivate={(task) => mutate(task, 'Reactivating task…', 'Task reactivated.', () => api.reactivate(task.id), undefined, () => tabsRef.current?.focus(selected))}
          />
        </div>
      ))}
      {deleteTask && (
        <DeleteTaskDialog
          task={deleteTask}
          pending={Boolean(pending)}
          onCancel={restoreDeleteFocus}
          onConfirm={() => mutate(deleteTask, 'Deleting task…', 'Task deleted.', () => api.delete(deleteTask.id), () => setDeleteTask(null), () => newTaskRef.current?.focus(), true)}
        />
      )}
    </section>
  )
}
