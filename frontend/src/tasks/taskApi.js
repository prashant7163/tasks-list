import { ApiError } from '../api'

async function payload(response) {
  if (response.status === 204) return undefined
  if (!(response.headers.get('Content-Type') ?? '').includes('application/json')) return undefined
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

async function send(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options })
  const body = await payload(response)
  if (!response.ok) throw new ApiError(response.status, body)
  return body
}

export function createTaskApi() {
  const allowed = {
    ACTIVE: new Set(['createdAt', 'priority', 'title']),
    COMPLETED: new Set(['completedAt', 'createdAt', 'title']),
  }

  async function mutate(path, method, details) {
    const csrf = await send('/api/auth/csrf')
    const options = {
      method,
      credentials: 'include',
      headers: { [csrf.headerName]: csrf.token },
    }
    if (details !== undefined) {
      options.headers['Content-Type'] = 'application/json'
      options.body = JSON.stringify({ title: details.title, description: details.description })
    }
    return send(path, options)
  }

  function list(status, sort) {
    if (!sort && allowed[status]) return send(`/api/tasks?status=${status}`)
    if (!allowed[status]?.has(sort?.key) || !['asc', 'desc'].includes(sort?.direction)) throw new Error('Unsupported task sort')
    const query = new URLSearchParams({ status, sort: sort.key, direction: sort.direction })
    return send(`/api/tasks?${query}`)
  }

  async function reorder(taskIds) {
    const csrf = await send('/api/auth/csrf')
    return send('/api/tasks/reorder', {
      method: 'POST',
      credentials: 'include',
      headers: { [csrf.headerName]: csrf.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds }),
    })
  }

  return {
    list,
    counts: () => send('/api/tasks/counts'),
    create: (details) => mutate('/api/tasks', 'POST', details),
    edit: (id, details) => mutate(`/api/tasks/${id}`, 'PUT', details),
    delete: (id) => mutate(`/api/tasks/${id}`, 'DELETE'),
    complete: (id) => mutate(`/api/tasks/${id}/complete`, 'POST'),
    reactivate: (id) => mutate(`/api/tasks/${id}/reactivate`, 'POST'),
    reorder,
  }
}
