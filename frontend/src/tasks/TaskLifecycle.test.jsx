import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import App from '../App'
import { createTaskApi } from './taskApi'

function response(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  })
}

function task(overrides = {}) {
  return {
    id: 1,
    title: 'Write release notes',
    description: 'Summarize the changes for the team.',
    status: 'ACTIVE',
    priority: 1,
    createdAt: '2026-09-12T18:00:00Z',
    completedAt: null,
    ...overrides,
  }
}

function csrf(token = 'task-token') {
  return response(200, { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token })
}

function queue(...values) {
  vi.stubGlobal('fetch', vi.fn())
  values.forEach((value) => fetch.mockResolvedValueOnce(value))
}

function initial(active = [], completed = []) {
  return [
    response(200, { displayName: 'Ada', email: 'ada@example.com' }),
    response(200, { tasks: active, count: active.length }),
    response(200, { tasks: completed, count: completed.length }),
    response(200, { active: active.length, completed: completed.length }),
  ]
}

beforeEach(() => {
  window.history.replaceState({}, '', '/tasks')
})

it('lands on Active with independent counts and keeps Completed tasks read-only', async () => {
  const active = task()
  const completed = task({
    id: 2,
    title: 'Archive receipts',
    description: 'The quarterly receipts are archived.',
    status: 'COMPLETED',
    priority: null,
    completedAt: '2026-09-12T19:00:00Z',
  })
  queue(...initial([active], [completed]))
  const user = userEvent.setup()

  render(<App />)

  expect(await screen.findByRole('tab', { name: 'Active (1)' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('heading', { name: active.title })).toBeInTheDocument()
  expect(screen.queryByRole('article', { name: completed.title })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New task' })).toBeInTheDocument()

  await user.click(screen.getByRole('tab', { name: 'Completed (1)' }))

  const card = screen.getByRole('article', { name: completed.title })
  expect(within(card).getByText('Completed Sep 12, 2026')).toBeInTheDocument()
  expect(within(card).getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  expect(within(card).queryByRole('button', { name: /edit|delete/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'New task' })).not.toBeInTheDocument()
})

it('implements roving keyboard tabs with labelled tab panels', async () => {
  queue(...initial([task()], [task({ id: 2, title: 'Archived task', status: 'COMPLETED', priority: null, completedAt: '2026-09-12T19:00:00Z' })]))
  const user = userEvent.setup()
  render(<App />)

  const activeTab = await screen.findByRole('tab', { name: 'Active (1)' })
  const completedTab = screen.getByRole('tab', { name: 'Completed (1)' })
  expect(activeTab).toHaveAttribute('tabindex', '0')
  expect(completedTab).toHaveAttribute('tabindex', '-1')
  expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', activeTab.id)
  expect(screen.getByRole('tabpanel')).toHaveAttribute('tabindex', '0')
  expect(document.getElementById(activeTab.getAttribute('aria-controls'))).toBeInTheDocument()
  expect(document.getElementById(completedTab.getAttribute('aria-controls'))).toBeInTheDocument()

  activeTab.focus()
  await user.keyboard('{ArrowRight}')
  expect(completedTab).toHaveFocus()
  expect(completedTab).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', completedTab.id)

  await user.keyboard('{Home}')
  expect(activeTab).toHaveFocus()
  await user.keyboard('{End}')
  expect(completedTab).toHaveFocus()
  await user.keyboard('{ArrowLeft}')
  expect(activeTab).toHaveFocus()
})

it('validates task fields, focuses the first error, and submits only editable fields', async () => {
  queue(
    ...initial(),
    csrf(),
    response(201, task({ id: 3, title: 'Plan launch', description: 'Prepare the launch checklist.' })),
    response(200, { tasks: [task({ id: 3, title: 'Plan launch', description: 'Prepare the launch checklist.' })], count: 1 }),
    response(200, { tasks: [], count: 0 }),
    response(200, { active: 1, completed: 0 }),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: 'New task' }))
  await user.click(screen.getByRole('button', { name: 'Create task' }))

  expect(screen.getByLabelText('Title')).toHaveFocus()
  expect(screen.getByLabelText('Title')).toHaveAccessibleErrorMessage('Title is required.')
  expect(screen.getByLabelText('Description')).toHaveAccessibleErrorMessage('Description is required.')

  await user.type(screen.getByLabelText('Title'), ' Plan launch ')
  await user.type(screen.getByLabelText('Description'), ' Prepare the launch checklist. ')
  await user.click(screen.getByRole('button', { name: 'Create task' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Task created.')
  expect(screen.getByRole('heading', { name: 'Plan launch' })).toBeInTheDocument()
  expect(fetch.mock.calls[5][1].body).toBe(JSON.stringify({
    title: ' Plan launch ',
    description: ' Prepare the launch checklist. ',
  }))
})

it('edits an active task and reconciles the authoritative response', async () => {
  const original = task()
  const edited = task({ title: 'Publish release notes', description: 'Share the final notes.' })
  queue(
    ...initial([original]),
    csrf(), response(200, edited),
    response(200, { tasks: [edited], count: 1 }),
    response(200, { tasks: [], count: 0 }),
    response(200, { active: 1, completed: 0 }),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: `Edit ${original.title}` }))
  await user.clear(screen.getByLabelText('Title'))
  await user.type(screen.getByLabelText('Title'), edited.title)
  await user.clear(screen.getByLabelText('Description'))
  await user.type(screen.getByLabelText('Description'), edited.description)
  await user.click(screen.getByRole('button', { name: 'Save changes' }))

  expect(await screen.findByRole('heading', { name: edited.title })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Task updated.')
  expect(fetch.mock.calls[5]).toEqual(['/api/tasks/1', expect.objectContaining({
    method: 'PUT',
    body: JSON.stringify({ title: edited.title, description: edited.description }),
  })])
})

it('resets the edit form when selecting a different task and submits that task id', async () => {
  const first = task()
  const second = task({ id: 2, title: 'Review invoices', description: 'Check the September invoices.', priority: 2 })
  const editedSecond = { ...second, title: 'Approve invoices' }
  queue(
    ...initial([first, second]),
    csrf(), response(200, editedSecond),
    response(200, { tasks: [first, editedSecond], count: 2 }),
    response(200, { tasks: [], count: 0 }),
    response(200, { active: 2, completed: 0 }),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: `Edit ${first.title}` }))
  expect(screen.getByLabelText('Title')).toHaveValue(first.title)
  await user.click(screen.getByRole('button', { name: `Edit ${second.title}` }))

  expect(screen.getByLabelText('Title')).toHaveValue(second.title)
  expect(screen.getByLabelText('Description')).toHaveValue(second.description)
  await user.clear(screen.getByLabelText('Title'))
  await user.type(screen.getByLabelText('Title'), editedSecond.title)
  await user.click(screen.getByRole('button', { name: 'Save changes' }))

  await screen.findByRole('heading', { name: editedSecond.title })
  expect(fetch.mock.calls[5]).toEqual(['/api/tasks/2', expect.objectContaining({
    method: 'PUT',
    body: JSON.stringify({ title: editedSecond.title, description: second.description }),
  })])
})

it('reports a committed mutation that could not be reconciled without false success', async () => {
  const created = task({ id: 3, title: 'Plan launch', description: 'Prepare the launch checklist.' })
  queue(
    ...initial(),
    csrf(), response(201, created),
    response(500, { error: 'Request could not be completed' }),
    response(500, { error: 'Request could not be completed' }),
    response(500, { error: 'Request could not be completed' }),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: 'New task' }))
  await user.type(screen.getByLabelText('Title'), created.title)
  await user.type(screen.getByLabelText('Description'), created.description)
  await user.click(screen.getByRole('button', { name: 'Create task' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('The change was saved, but the latest tasks could not be loaded. Retry to reconcile.')
  expect(screen.getByRole('status')).not.toHaveTextContent('Task created.')
  expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus()

  fetch
    .mockResolvedValueOnce(response(200, { tasks: [created], count: 1 }))
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 }))
    .mockResolvedValueOnce(response(200, { active: 1, completed: 0 }))
  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findByRole('heading', { name: created.title })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Tasks loaded.')
})

it('cancels deletion without a request and confirms permanent deletion', async () => {
  const active = task()
  queue(
    ...initial([active]),
    csrf(), response(204),
    response(200, { tasks: [], count: 0 }),
    response(200, { tasks: [], count: 0 }),
    response(200, { active: 0, completed: 0 }),
  )
  const user = userEvent.setup()
  render(<App />)

  const deleteButton = await screen.findByRole('button', { name: `Delete ${active.title}` })
  await user.click(deleteButton)
  const dialog = screen.getByRole('dialog', { name: 'Delete task?' })
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('heading', { name: active.title })).toBeInTheDocument()
  expect(deleteButton).toHaveFocus()
  expect(fetch).toHaveBeenCalledTimes(4)

  await user.click(screen.getByRole('button', { name: `Delete ${active.title}` }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete task' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Task deleted.')
  expect(screen.queryByRole('heading', { name: active.title })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New task' })).toHaveFocus()
})

it('contains dialog focus, closes on Escape, and restores the delete trigger', async () => {
  const active = task()
  queue(...initial([active]))
  const user = userEvent.setup()
  render(<App />)

  const trigger = await screen.findByRole('button', { name: `Delete ${active.title}` })
  await user.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Delete task?' })
  const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
  const confirm = within(dialog).getByRole('button', { name: 'Delete task' })
  expect(cancel).toHaveFocus()
  await user.tab()
  expect(confirm).toHaveFocus()
  await user.tab()
  expect(cancel).toHaveFocus()

  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('closes a failed delete dialog, reports the failure, and offers focused reconciliation retry', async () => {
  const active = task()
  queue(...initial([active]), csrf(), response(500, { error: 'Request could not be completed' }))
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: `Delete ${active.title}` }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete task' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('The task action could not be completed. Please try again.')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus()

  fetch
    .mockResolvedValueOnce(response(200, { tasks: [active], count: 1 }))
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 }))
    .mockResolvedValueOnce(response(200, { active: 1, completed: 0 }))
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('heading', { name: active.title })).toBeInTheDocument()
})

it('completes and reactivates with pending controls and updated counts', async () => {
  const active = task()
  const completed = task({ status: 'COMPLETED', priority: null, completedAt: '2026-09-12T20:00:00Z' })
  const reactivated = task({ priority: 1 })
  let finishCompletion
  const pendingCompletion = new Promise((resolve) => { finishCompletion = resolve })
  queue(...initial([active]), csrf(), pendingCompletion)
  const user = userEvent.setup()
  render(<App />)

  const checkbox = await screen.findByRole('checkbox', { name: `Complete ${active.title}` })
  await user.click(checkbox)
  expect(checkbox).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Completing task…')

  fetch
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 }))
    .mockResolvedValueOnce(response(200, { tasks: [completed], count: 1 }))
    .mockResolvedValueOnce(response(200, { active: 0, completed: 1 }))
  finishCompletion(response(200, completed))

  expect(await screen.findByRole('tab', { name: 'Completed (1)' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Active (0)' })).toHaveFocus()
  await user.click(screen.getByRole('tab', { name: 'Completed (1)' }))
  expect(screen.getByRole('heading', { name: active.title })).toBeInTheDocument()

  fetch
    .mockResolvedValueOnce(csrf('reactivate-token'))
    .mockResolvedValueOnce(response(200, reactivated))
    .mockResolvedValueOnce(response(200, { tasks: [reactivated], count: 1 }))
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 }))
    .mockResolvedValueOnce(response(200, { active: 1, completed: 0 }))
  await user.click(screen.getByRole('button', { name: 'Reactivate' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Task reactivated.')
  expect(screen.getByRole('tab', { name: 'Active (1)' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Completed (0)' })).toHaveFocus()
})

it('closes the matching edit form and focuses Active after completing that task', async () => {
  const active = task()
  const completed = task({ status: 'COMPLETED', priority: null, completedAt: '2026-09-12T20:00:00Z' })
  queue(
    ...initial([active]),
    csrf(), response(200, completed),
    response(200, { tasks: [], count: 0 }),
    response(200, { tasks: [completed], count: 1 }),
    response(200, { active: 0, completed: 1 }),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: `Edit ${active.title}` }))
  expect(screen.getByRole('form', { name: `Edit ${active.title}` })).toBeInTheDocument()
  await user.click(screen.getByRole('checkbox', { name: `Complete ${active.title}` }))

  expect(await screen.findByRole('status')).toHaveTextContent('Task completed.')
  expect(screen.queryByRole('form', { name: `Edit ${active.title}` })).not.toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Active (0)' })).toHaveFocus()
})

it('closes the matching edit form and focuses New task after deleting that task', async () => {
  const active = task()
  queue(
    ...initial([active]),
    csrf(), response(204),
    response(200, { tasks: [], count: 0 }),
    response(200, { tasks: [], count: 0 }),
    response(200, { active: 0, completed: 0 }),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: `Edit ${active.title}` }))
  expect(screen.getByRole('form', { name: `Edit ${active.title}` })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: `Delete ${active.title}` }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete task' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Task deleted.')
  expect(screen.queryByRole('form', { name: `Edit ${active.title}` })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New task' })).toHaveFocus()
})

it.each([404, 409])('restores focus after authoritative retry removes a stale edit form (%s)', async (status) => {
  const active = task()
  queue(...initial([active]), csrf(), response(status, { error: 'Task is stale' }))
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: `Edit ${active.title}` }))
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('button', { name: 'Retry' })).toHaveFocus()

  fetch
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 }))
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 }))
    .mockResolvedValueOnce(response(200, { active: 0, completed: 0 }))
  await user.click(screen.getByRole('button', { name: 'Retry' }))

  await waitFor(() => expect(screen.queryByRole('form', { name: `Edit ${active.title}` })).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'New task' })).toHaveFocus()
})

it('focuses the selected tab after deleting another task while an edit form remains open', async () => {
  const editing = task()
  const deleted = task({ id: 2, title: 'Review invoices', description: 'Check the September invoices.', priority: 2 })
  queue(
    ...initial([editing, deleted]),
    csrf(), response(204),
    response(200, { tasks: [editing], count: 1 }),
    response(200, { tasks: [], count: 0 }),
    response(200, { active: 1, completed: 0 }),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: `Edit ${editing.title}` }))
  await user.click(screen.getByRole('button', { name: `Delete ${deleted.title}` }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete task' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Task deleted.')
  expect(screen.getByRole('form', { name: `Edit ${editing.title}` })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Active (1)' })).toHaveFocus()
})

it('shows a safe stale-state message, refreshes, and keeps retry available', async () => {
  const active = task()
  queue(...initial([active]), csrf(), response(409, { error: 'Invalid task transition' }))
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('checkbox', { name: `Complete ${active.title}` }))
  expect(await screen.findByRole('alert')).toHaveTextContent('This task changed. Refresh the list and try again.')
  expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus()

  fetch
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 }))
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 }))
    .mockResolvedValueOnce(response(200, { active: 0, completed: 0 }))
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('No active tasks yet.')).toBeInTheDocument()
})

it('shows identical safe not-found handling for a missing or foreign task id', async () => {
  const active = task()
  queue(...initial([active]), csrf(), response(404, { error: 'Task not found' }))
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('checkbox', { name: `Complete ${active.title}` }))

  expect(await screen.findByRole('alert')).toHaveTextContent('This task was not found. Refresh the list and try again.')
  expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus()
  expect(screen.getByRole('heading', { name: active.title })).toBeInTheDocument()
})

it('recovers from an initial loading failure with an announced retry', async () => {
  queue(
    response(200, { displayName: 'Ada', email: 'ada@example.com' }),
    response(500, { error: 'Request could not be completed' }),
    response(500, { error: 'Request could not be completed' }),
    response(500, { error: 'Request could not be completed' }),
  )
  const user = userEvent.setup()
  render(<App />)

  expect(await screen.findByRole('alert')).toHaveTextContent('Tasks could not be loaded. Please try again.')
  expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus()

  fetch
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 }))
    .mockResolvedValueOnce(response(200, { tasks: [], count: 0 }))
    .mockResolvedValueOnce(response(200, { active: 0, completed: 0 }))
  await user.click(screen.getByRole('button', { name: 'Retry' }))

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Tasks loaded.'))
  expect(screen.getByText('No active tasks yet.')).toBeInTheDocument()
})

it('credentials task requests, obtains fresh CSRF, and strips authority fields from writes', async () => {
  const serverTask = task({ id: 7, title: 'Edited title', description: 'Edited description.' })
  queue(
    response(200, { tasks: [], count: 0 }),
    csrf('fresh-task-token'),
    response(200, serverTask),
    csrf('next-task-token'),
    response(200, { ...serverTask, status: 'COMPLETED', priority: null, completedAt: '2026-09-12T20:00:00Z' }),
  )
  const api = createTaskApi()

  await api.list('ACTIVE')
  await api.edit(7, {
    title: serverTask.title,
    description: serverTask.description,
    owner: { id: 999 },
    status: 'COMPLETED',
    priority: 91,
    createdAt: '1900-01-01T00:00:00Z',
    completedAt: '1900-01-01T00:00:00Z',
  })
  await api.complete(7)

  expect(fetch.mock.calls).toEqual([
    ['/api/tasks?status=ACTIVE', { credentials: 'include' }],
    ['/api/auth/csrf', { credentials: 'include' }],
    ['/api/tasks/7', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'X-CSRF-TOKEN': 'fresh-task-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: serverTask.title, description: serverTask.description }),
    }],
    ['/api/auth/csrf', { credentials: 'include' }],
    ['/api/tasks/7/complete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-TOKEN': 'next-task-token' },
    }],
  ])
})
