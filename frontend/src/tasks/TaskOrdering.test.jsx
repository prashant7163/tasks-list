import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import TaskPage from './TaskPage'
import { createTaskApi } from './taskApi'

function task(id, title, priority = id, overrides = {}) {
  return {
    id,
    title,
    description: `${title} details`,
    status: 'ACTIVE',
    priority,
    createdAt: `2026-09-${10 + id}T12:00:00Z`,
    completedAt: null,
    ...overrides,
  }
}

function sortTasks(tasks, sort) {
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...tasks].sort((left, right) => {
    let result
    if (sort.key === 'title') result = left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
    else if (sort.key === 'priority') result = left.priority - right.priority
    else result = new Date(left[sort.key]) - new Date(right[sort.key])
    return result * direction || left.id - right.id
  })
}

function fakeApi(activeTasks, completedTasks = []) {
  let active = [...activeTasks]
  const completed = [...completedTasks]
  return {
    list: vi.fn(async (status, sort) => ({
      tasks: sortTasks(status === 'ACTIVE' ? active : completed, sort),
      count: status === 'ACTIVE' ? active.length : completed.length,
    })),
    counts: vi.fn(async () => ({ active: active.length, completed: completed.length })),
    reorder: vi.fn(async (ids) => {
      active = ids.map((id, index) => ({ ...active.find((item) => item.id === id), priority: index + 1 }))
      return { tasks: active, count: active.length }
    }),
    setActive(next) { active = next },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function titles() {
  return screen.getAllByRole('article').map((article) => within(article).getByRole('heading').textContent)
}

beforeEach(() => {
  window.history.replaceState({}, '', '/tasks')
})

const allowedSorts = [
  ['ACTIVE', 'createdAt', 'asc'], ['ACTIVE', 'createdAt', 'desc'],
  ['ACTIVE', 'priority', 'asc'], ['ACTIVE', 'priority', 'desc'],
  ['ACTIVE', 'title', 'asc'], ['ACTIVE', 'title', 'desc'],
  ['COMPLETED', 'completedAt', 'asc'], ['COMPLETED', 'completedAt', 'desc'],
  ['COMPLETED', 'createdAt', 'asc'], ['COMPLETED', 'createdAt', 'desc'],
  ['COMPLETED', 'title', 'asc'], ['COMPLETED', 'title', 'desc'],
]

it.each(allowedSorts)('allows %s %s %s and emits only its typed query tuple', async (status, key, direction) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [], count: 0 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })))

  await createTaskApi().list(status, { key, direction })

  expect(fetch).toHaveBeenCalledWith(`/api/tasks?status=${status}&sort=${key}&direction=${direction}`, { credentials: 'include' })
})

it('keeps allowlisted Active and Completed sorts independent with documented defaults', async () => {
  const active = [task(1, 'zulu'), task(2, 'Alpha')]
  const completed = [
    task(3, 'bravo', null, { status: 'COMPLETED', completedAt: '2026-09-13T12:00:00Z' }),
    task(4, 'Charlie', null, { status: 'COMPLETED', completedAt: '2026-09-14T12:00:00Z' }),
  ]
  const api = fakeApi(active, completed)
  const user = userEvent.setup()

  render(<TaskPage api={api} onSessionEnded={vi.fn()} />)

  await screen.findByRole('tab', { name: 'Active (2)' })
  expect(await screen.findByLabelText('Sort Active tasks by')).toHaveValue('priority')
  expect(screen.getByLabelText('Active sort direction')).toHaveValue('asc')
  expect(titles()).toEqual(['zulu', 'Alpha'])
  expect(api.list).toHaveBeenCalledWith('ACTIVE', { key: 'priority', direction: 'asc' })
  expect(api.list).toHaveBeenCalledWith('COMPLETED', { key: 'completedAt', direction: 'desc' })
  expect(screen.getByText(/Drag tasks to change priority/)).toBeInTheDocument()

  await user.selectOptions(screen.getByLabelText('Sort Active tasks by'), 'title')
  await user.selectOptions(screen.getByLabelText('Active sort direction'), 'asc')
  await waitFor(() => expect(titles()).toEqual(['Alpha', 'zulu']))

  await user.click(screen.getByRole('tab', { name: 'Completed (2)' }))
  expect(screen.getByLabelText('Sort Completed tasks by')).toHaveValue('completedAt')
  expect(screen.getByLabelText('Completed sort direction')).toHaveValue('desc')
  expect(titles()).toEqual(['Charlie', 'bravo'])

  await user.selectOptions(screen.getByLabelText('Sort Completed tasks by'), 'title')
  await user.selectOptions(screen.getByLabelText('Completed sort direction'), 'asc')
  await waitFor(() => expect(titles()).toEqual(['bravo', 'Charlie']))

  await user.click(screen.getByRole('tab', { name: 'Active (2)' }))
  expect(screen.getByLabelText('Sort Active tasks by')).toHaveValue('title')
  expect(screen.getByLabelText('Active sort direction')).toHaveValue('asc')
  expect(api.list).toHaveBeenCalledWith('COMPLETED', { key: 'completedAt', direction: 'desc' })
  expect(api.list).toHaveBeenCalledWith('ACTIVE', { key: 'title', direction: 'asc' })
  expect(api.list).toHaveBeenCalledWith('COMPLETED', { key: 'title', direction: 'asc' })
})

it('shows the Active empty state in the default Priority view', async () => {
  render(<TaskPage api={fakeApi([])} onSessionEnded={vi.fn()} />)

  await screen.findByRole('tab', { name: 'Active (0)' })
  expect(await screen.findByText('No active tasks yet.')).toBeInTheDocument()
  expect(screen.queryByRole('status', { name: 'Reorder status' })).not.toBeInTheDocument()
})

it('enables mouse reorder only for Active Priority highest-first and cancels without saving', async () => {
  const api = fakeApi([task(1, 'First'), task(2, 'Second')])
  const user = userEvent.setup()
  render(<TaskPage api={api} onSessionEnded={vi.fn()} />)

  await screen.findByRole('tab', { name: 'Active (2)' })
  await user.selectOptions(await screen.findByLabelText('Sort Active tasks by'), 'createdAt')
  expect(screen.queryByText(/Drag tasks to change priority/)).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Sort Active tasks by'), 'priority')
  await user.selectOptions(screen.getByLabelText('Active sort direction'), 'asc')
  await waitFor(() => expect(titles()).toEqual(['First', 'Second']))

  const first = await screen.findByRole('article', { name: 'First' })
  const second = screen.getByRole('article', { name: 'Second' })
  expect(first).toHaveAttribute('draggable', 'true')
  expect(screen.getByText(/Drag tasks to change priority/)).toBeInTheDocument()

  fireEvent.dragStart(first)
  expect(screen.getByRole('status', { name: 'Reorder status' })).toHaveTextContent('Picked up First')
  fireEvent.dragEnter(second)
  expect(screen.getByRole('status', { name: 'Reorder status' })).toHaveTextContent('Drop at position 2')
  fireEvent.dragEnd(first)

  expect(api.reorder).not.toHaveBeenCalled()
  expect(titles()).toEqual(['First', 'Second'])
  expect(screen.getByRole('status', { name: 'Reorder status' })).toHaveTextContent('Reorder cancelled')

  await user.selectOptions(screen.getByLabelText('Active sort direction'), 'desc')
  expect(screen.queryByText(/Drag tasks to change priority/)).not.toBeInTheDocument()
  expect(screen.getByRole('article', { name: 'First' })).not.toHaveAttribute('draggable', 'true')
})

it('does not expose stale tasks for reorder while Priority highest-first is loading', async () => {
  const priorityLoad = deferred()
  let deferPriority = false
  const api = fakeApi([task(1, 'First', 2), task(2, 'Second', 1)])
  const immediateList = api.list
  api.list = vi.fn((status, sort) => {
    if (status === 'ACTIVE' && sort.key === 'priority' && sort.direction === 'asc' && deferPriority) return priorityLoad.promise
    return immediateList(status, sort)
  })
  const user = userEvent.setup()
  render(<TaskPage api={api} onSessionEnded={vi.fn()} />)

  await screen.findByRole('tab', { name: 'Active (2)' })
  await waitFor(() => expect(titles()).toEqual(['Second', 'First']))
  deferPriority = true
  await user.selectOptions(screen.getByLabelText('Sort Active tasks by'), 'createdAt')
  await user.selectOptions(screen.getByLabelText('Sort Active tasks by'), 'priority')

  const staleFirst = screen.getByRole('article', { name: 'First' })
  const staleSecond = screen.getByRole('article', { name: 'Second' })
  expect.soft(staleFirst).not.toHaveAttribute('draggable', 'true')
  fireEvent.dragStart(staleFirst)
  fireEvent.dragEnter(staleSecond)
  fireEvent.drop(staleSecond)
  expect.soft(api.reorder).not.toHaveBeenCalled()

  priorityLoad.resolve({ tasks: [task(2, 'Second', 1), task(1, 'First', 2)], count: 2 })
  await waitFor(() => expect(titles()).toEqual(['Second', 'First']))
  expect(screen.getByRole('article', { name: 'Second' })).toHaveAttribute('draggable', 'true')
})

it('restores the last confirmed presentation when Priority highest-first fails to load', async () => {
  const priorityLoad = deferred()
  let deferPriority = false
  const api = fakeApi([task(1, 'First', 2), task(2, 'Second', 1)])
  const immediateList = api.list
  api.list = vi.fn((status, sort) => {
    if (status === 'ACTIVE' && sort.key === 'priority' && sort.direction === 'asc' && deferPriority) return priorityLoad.promise
    return immediateList(status, sort)
  })
  const user = userEvent.setup()
  render(<TaskPage api={api} onSessionEnded={vi.fn()} />)

  await screen.findByRole('tab', { name: 'Active (2)' })
  await waitFor(() => expect(titles()).toEqual(['Second', 'First']))
  deferPriority = true
  await user.selectOptions(screen.getByLabelText('Sort Active tasks by'), 'createdAt')
  await user.selectOptions(screen.getByLabelText('Sort Active tasks by'), 'priority')

  const staleFirst = screen.getByRole('article', { name: 'First' })
  const staleSecond = screen.getByRole('article', { name: 'Second' })
  expect.soft(staleFirst).not.toHaveAttribute('draggable', 'true')
  fireEvent.dragStart(staleFirst)
  fireEvent.dragEnter(staleSecond)
  fireEvent.drop(staleSecond)
  expect.soft(api.reorder).not.toHaveBeenCalled()
  priorityLoad.reject(new ApiError(500, { error: 'Sort failed' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Tasks could not be loaded. Please try again.')
  expect(screen.getByLabelText('Sort Active tasks by')).toHaveValue('createdAt')
  expect(screen.getByLabelText('Active sort direction')).toHaveValue('asc')
  expect(titles()).toEqual(['First', 'Second'])
  expect(screen.getByRole('article', { name: 'First' })).not.toHaveAttribute('draggable', 'true')
  expect(api.reorder).not.toHaveBeenCalled()
})

it('locks conflicting actions while reorder is pending and adopts the authoritative response', async () => {
  let finishReorder
  const pendingReorder = new Promise((resolve) => { finishReorder = resolve })
  const api = fakeApi([task(1, 'First'), task(2, 'Second')])
  api.reorder.mockImplementationOnce(() => pendingReorder)
  const user = userEvent.setup()
  render(<TaskPage api={api} onSessionEnded={vi.fn()} />)

  await screen.findByRole('tab', { name: 'Active (2)' })
  await waitFor(() => expect(titles()).toEqual(['First', 'Second']))
  const first = screen.getByRole('article', { name: 'First' })
  const second = screen.getByRole('article', { name: 'Second' })
  fireEvent.dragStart(first)
  fireEvent.dragEnter(second)
  fireEvent.drop(second)

  await waitFor(() => expect(api.reorder).toHaveBeenCalledWith([2, 1]))
  expect(screen.getByLabelText('Sort Active tasks by')).toBeDisabled()
  expect(screen.getByRole('tab', { name: 'Completed (0)' })).toBeDisabled()
  expect(within(screen.getByRole('article', { name: 'Second' })).getByRole('button', { name: /Edit/ })).toBeDisabled()
  expect(screen.getByRole('status', { name: 'Reorder status' })).toHaveTextContent('Saving priority order')

  api.setActive([task(2, 'Second', 1), task(1, 'First', 2)])
  finishReorder({ tasks: [task(2, 'Second', 1), task(1, 'First', 2)], count: 2 })

  await waitFor(() => expect(titles()).toEqual(['Second', 'First']))
  expect(screen.getByRole('status', { name: 'Reorder status' })).toHaveTextContent('Priority order saved')
  await waitFor(() => expect(screen.getByRole('article', { name: 'First' })).toHaveFocus())
})

it('reloads authoritative order after a rejected reorder and reports the rollback', async () => {
  const api = fakeApi([task(1, 'First'), task(2, 'Second')])
  api.reorder.mockRejectedValueOnce(new ApiError(409, { error: 'Task order is stale' }))
  const user = userEvent.setup()
  render(<TaskPage api={api} onSessionEnded={vi.fn()} />)

  await screen.findByRole('tab', { name: 'Active (2)' })
  await waitFor(() => expect(titles()).toEqual(['First', 'Second']))
  fireEvent.dragStart(screen.getByRole('article', { name: 'First' }))
  fireEvent.dragEnter(screen.getByRole('article', { name: 'Second' }))
  fireEvent.drop(screen.getByRole('article', { name: 'Second' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Priority order could not be saved. The latest order was restored.')
  await waitFor(() => expect(titles()).toEqual(['First', 'Second']))
  expect(api.list).toHaveBeenLastCalledWith('COMPLETED', { key: 'completedAt', direction: 'desc' })
  expect(screen.getByRole('article', { name: 'First' })).toHaveFocus()
})

it('sends only allowlisted sort values and a complete task-id reorder payload', async () => {
  const response = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  })
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 }))
    .mockResolvedValueOnce(response(200, { headerName: 'X-CSRF-TOKEN', token: 'safe-token' }))
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 })))
  const api = createTaskApi()

  await api.list('ACTIVE', { key: 'title', direction: 'asc' })
  await api.reorder([3, 1, 2])

  expect(fetch.mock.calls).toEqual([
    ['/api/tasks?status=ACTIVE&sort=title&direction=asc', { credentials: 'include' }],
    ['/api/auth/csrf', { credentials: 'include' }],
    ['/api/tasks/reorder', expect.objectContaining({
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': 'safe-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds: [3, 1, 2] }),
    })],
  ])
  expect(() => api.list('ACTIVE', { key: 'completedAt', direction: 'sideways' })).toThrow('Unsupported task sort')
})
