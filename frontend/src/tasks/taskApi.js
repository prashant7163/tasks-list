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

  return {
    list: (status) => send(`/api/tasks?status=${encodeURIComponent(status)}`),
    counts: () => send('/api/tasks/counts'),
    create: (details) => mutate('/api/tasks', 'POST', details),
    edit: (id, details) => mutate(`/api/tasks/${id}`, 'PUT', details),
    delete: (id) => mutate(`/api/tasks/${id}`, 'DELETE'),
    complete: (id) => mutate(`/api/tasks/${id}/complete`, 'POST'),
    reactivate: (id) => mutate(`/api/tasks/${id}/reactivate`, 'POST'),
  }
}
