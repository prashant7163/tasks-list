import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api'
import DeleteTaskDialog from './DeleteTaskDialog'
import PriorityTaskList from './PriorityTaskList'
import TaskForm from './TaskForm'
import TaskList from './TaskList'
import TaskSortControls from './TaskSortControls'
import TaskTabs from './TaskTabs'

const EMPTY = { ACTIVE: [], COMPLETED: [] }
const DEFAULT_SORTS = {
  ACTIVE: { key: 'priority', direction: 'asc' },
  COMPLETED: { key: 'completedAt', direction: 'desc' },
}

export default function TaskPage({ api, onSessionEnded }) {
  const [selected, setSelected] = useState('ACTIVE')
  const [lists, setLists] = useState(EMPTY)
  const [counts, setCounts] = useState({ active: 0, completed: 0 })
  const [sorts, setSorts] = useState(DEFAULT_SORTS)
  const [confirmedSorts, setConfirmedSorts] = useState(DEFAULT_SORTS)
  const [loading, setLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
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
  const editingTaskIdRef = useRef(null)
  const postRenderFocusRef = useRef(null)
  const priorityListRef = useRef(null)
  const loadSequenceRef = useRef(0)
  const confirmedSortsRef = useRef(DEFAULT_SORTS)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  function closeTaskForm() {
    editingTaskIdRef.current = null
    setFormTask(undefined)
    setFormOpen(false)
  }

  function scheduleStableTaskFocus() {
    postRenderFocusRef.current = () => {
      if (newTaskRef.current) newTaskRef.current.focus()
      else tabsRef.current?.focus(selectedRef.current)
    }
  }

  const load = useCallback(async (announce = true, requestedSorts = confirmedSortsRef.current) => {
    const sequence = ++loadSequenceRef.current
    setLoading(true)
    setError('')
    try {
      const [active, completed, nextCounts] = await Promise.all([
        api.list('ACTIVE', requestedSorts.ACTIVE), api.list('COMPLETED', requestedSorts.COMPLETED), api.counts(),
      ])
      if (sequence !== loadSequenceRef.current) return false
      setLists({ ACTIVE: active.tasks, COMPLETED: completed.tasks })
      setCounts(nextCounts)
      setSorts(requestedSorts)
      setConfirmedSorts(requestedSorts)
      confirmedSortsRef.current = requestedSorts
      setHasLoaded(true)
      if (editingTaskIdRef.current && !active.tasks.some((task) => task.id === editingTaskIdRef.current)) {
        closeTaskForm()
        scheduleStableTaskFocus()
      }
      if (announce) setAnnouncement('Tasks loaded.')
      return true
    } catch (requestError) {
      if (sequence !== loadSequenceRef.current) return false
      if (requestError instanceof ApiError && requestError.status === 401) onSessionEnded()
      else {
        setSorts(confirmedSortsRef.current)
        setError('Tasks could not be loaded. Please try again.')
      }
      return false
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false)
    }
  }, [api, onSessionEnded])

  useEffect(() => {
    const frame = requestAnimationFrame(() => load(false, DEFAULT_SORTS))
    return () => cancelAnimationFrame(frame)
  }, [load])
  useEffect(() => {
    if (error) retryRef.current?.focus()
  }, [error])
  useEffect(() => {
    const focus = postRenderFocusRef.current
    postRenderFocusRef.current = null
    focus?.()
  })

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

  async function mutate(task, pendingText, successText, operation, close, afterReconcile, closeOnFailure = false, closeMatchingEdit = false) {
    if (pending || (loading && hasLoaded)) return
    setPending({ id: task?.id ?? 'new', text: pendingText })
    setAnnouncement(pendingText)
    setError('')
    try {
      await operation()
      if (closeMatchingEdit && editingTaskIdRef.current === task?.id) closeTaskForm()
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

  async function reorder(orderedIds, draggedId, setReorderMessage) {
    if (pending || (loading && hasLoaded) || confirmedSorts.ACTIVE.key !== 'priority' || confirmedSorts.ACTIVE.direction !== 'asc') return
    setPending({ id: 'reorder', text: 'Saving priority order…' })
    setAnnouncement('Saving priority order…')
    setError('')
    try {
      await api.reorder(orderedIds)
      const reconciled = await load(false)
      if (reconciled) {
        setAnnouncement('Priority order saved.')
        setReorderMessage('Priority order saved.')
      } else {
        setReorderMessage('Priority was saved, but the latest order could not be loaded.')
        setError('The priority order was saved, but the latest tasks could not be loaded. Retry to reconcile.')
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        onSessionEnded()
        return
      }
      const restored = await load(false)
      setError(restored
        ? 'Priority order could not be saved. The latest order was restored.'
        : 'Priority order could not be saved or reloaded. Please retry to reconcile.')
      setReorderMessage(restored ? 'Priority order restored.' : 'Priority order could not be reconciled.')
    } finally {
      postRenderFocusRef.current = () => priorityListRef.current?.focus(draggedId)
      setPending(null)
    }
  }

  const heading = selected === 'ACTIVE' ? 'Active tasks' : 'Completed tasks'
  const interactionLocked = Boolean(pending) || (loading && hasLoaded)

  return (
    <section className="task-shell" aria-labelledby="task-view-title">
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      {error && (
        <div className="alert action-message" role="alert">
          <span>{error}</span>
          <button ref={retryRef} className="secondary" type="button" onClick={() => load(true)}>Retry</button>
        </div>
      )}
      <TaskTabs ref={tabsRef} selected={selected} counts={counts} disabled={interactionLocked} onSelect={(status) => { setSelected(status); closeTaskForm(); setDeleteTask(null) }} />
      <div className="task-heading">
        <div><p className="eyebrow">Private workspace</p><h1 id="task-view-title">{heading}</h1></div>
        {selected === 'ACTIVE' && !formOpen && <button ref={newTaskRef} className="primary compact" type="button" disabled={interactionLocked} onClick={() => { editingTaskIdRef.current = null; setFormTask(undefined); setFormOpen(true) }}>New task</button>}
      </div>
      <TaskSortControls
        status={selected}
        value={sorts[selected]}
        disabled={interactionLocked}
        onChange={(nextSort) => {
          setError('')
          setAnnouncement(`Loading ${selected === 'ACTIVE' ? 'Active' : 'Completed'} tasks in the selected order…`)
          const requestedSorts = { ...sorts, [selected]: nextSort }
          setSorts(requestedSorts)
          load(false, requestedSorts)
        }}
      />
      {formOpen && (
        <TaskForm
          key={formTask?.id ?? 'new'}
          task={formTask}
          pending={interactionLocked}
          onCancel={closeTaskForm}
          onSubmit={(values) => mutate(formTask, formTask ? 'Updating task…' : 'Creating task…', formTask ? 'Task updated.' : 'Task created.', () => formTask ? api.edit(formTask.id, values) : api.create(values), closeTaskForm)}
        />
      )}
      {loading && <p className="status" role="status">{hasLoaded ? 'Refreshing tasks…' : 'Loading tasks…'}</p>}
      {(!loading || hasLoaded) && ['ACTIVE', 'COMPLETED'].map((status) => (
        <div key={status} id={`task-panel-${status.toLowerCase()}`} role="tabpanel" aria-labelledby={`task-tab-${status.toLowerCase()}`} tabIndex="0" hidden={selected !== status}>
          {status === 'ACTIVE' && confirmedSorts.ACTIVE.key === 'priority' && confirmedSorts.ACTIVE.direction === 'asc' ? (
            <PriorityTaskList
              ref={priorityListRef}
              tasks={lists.ACTIVE}
              disabled={interactionLocked}
              onReorder={reorder}
              onEdit={(task) => { editingTaskIdRef.current = task.id; setFormTask(task); setFormOpen(true) }}
              onDelete={(task, trigger) => { deleteReturnFocusRef.current = trigger; setDeleteTask(task) }}
              onComplete={(task) => mutate(task, 'Completing task…', 'Task completed.', () => api.complete(task.id), undefined, () => { postRenderFocusRef.current = () => tabsRef.current?.focus(selected) }, false, true)}
            />
          ) : (
            <TaskList
              status={status}
              tasks={lists[status]}
              disabled={interactionLocked}
              onEdit={(task) => { editingTaskIdRef.current = task.id; setFormTask(task); setFormOpen(true) }}
              onDelete={(task, trigger) => { deleteReturnFocusRef.current = trigger; setDeleteTask(task) }}
              onComplete={(task) => mutate(task, 'Completing task…', 'Task completed.', () => api.complete(task.id), undefined, () => { postRenderFocusRef.current = () => tabsRef.current?.focus(selected) }, false, true)}
              onReactivate={(task) => mutate(task, 'Reactivating task…', 'Task reactivated.', () => api.reactivate(task.id), undefined, () => { postRenderFocusRef.current = () => tabsRef.current?.focus(selected) })}
            />
          )}
        </div>
      ))}
      {deleteTask && (
        <DeleteTaskDialog
          task={deleteTask}
          pending={interactionLocked}
          onCancel={restoreDeleteFocus}
          onConfirm={() => mutate(deleteTask, 'Deleting task…', 'Task deleted.', () => api.delete(deleteTask.id), () => setDeleteTask(null), scheduleStableTaskFocus, true, true)}
        />
      )}
    </section>
  )
}
