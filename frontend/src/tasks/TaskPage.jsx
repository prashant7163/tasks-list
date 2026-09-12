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

  async function mutate(task, pendingText, successText, operation, close) {
    if (pending) return
    setPending({ id: task?.id ?? 'new', text: pendingText })
    setAnnouncement(pendingText)
    setError('')
    try {
      await operation()
      close?.()
      await load(false)
      setAnnouncement(successText)
    } catch (requestError) {
      setError(explainFailure(requestError))
    } finally {
      setPending(null)
    }
  }

  const currentTasks = lists[selected]
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
      <TaskTabs selected={selected} counts={counts} onSelect={(status) => { setSelected(status); setFormOpen(false); setDeleteTask(null) }} />
      <div className="task-heading">
        <div><p className="eyebrow">Private workspace</p><h1 id="task-view-title">{heading}</h1></div>
        {selected === 'ACTIVE' && !formOpen && <button className="primary compact" type="button" onClick={() => { setFormTask(undefined); setFormOpen(true) }}>New task</button>}
      </div>
      {formOpen && (
        <TaskForm
          task={formTask}
          pending={Boolean(pending)}
          onCancel={() => setFormOpen(false)}
          onSubmit={(values) => mutate(formTask, formTask ? 'Updating task…' : 'Creating task…', formTask ? 'Task updated.' : 'Task created.', () => formTask ? api.edit(formTask.id, values) : api.create(values), () => setFormOpen(false))}
        />
      )}
      {loading ? <p className="status" role="status">Loading tasks…</p> : (
        <div id="task-panel" role="tabpanel" aria-labelledby="task-view-title">
          <TaskList
            status={selected}
            tasks={currentTasks}
            pendingId={pending?.id}
            onEdit={(task) => { setFormTask(task); setFormOpen(true) }}
            onDelete={setDeleteTask}
            onComplete={(task) => mutate(task, 'Completing task…', 'Task completed.', () => api.complete(task.id))}
            onReactivate={(task) => mutate(task, 'Reactivating task…', 'Task reactivated.', () => api.reactivate(task.id))}
          />
        </div>
      )}
      {deleteTask && (
        <DeleteTaskDialog
          task={deleteTask}
          pending={Boolean(pending)}
          onCancel={() => setDeleteTask(null)}
          onConfirm={() => mutate(deleteTask, 'Deleting task…', 'Task deleted.', () => api.delete(deleteTask.id), () => setDeleteTask(null))}
        />
      )}
    </section>
  )
}
