export class ApiError extends Error {
  constructor(status, payload = {}) {
    super('API request failed')
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

async function readPayload(response) {
  if (response.status === 204) return undefined
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) return undefined
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

async function send(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options })
  const payload = await readPayload(response)
  if (!response.ok) throw new ApiError(response.status, payload)
  return payload
}

export function createApiClient() {
  async function post(path, data) {
    const csrf = await send('/api/auth/csrf')
    const options = {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        [csrf.headerName]: csrf.token,
      },
    }
    if (data !== undefined) options.body = JSON.stringify(data)
    return send(path, options)
  }

  return {
    currentUser: () => send('/api/auth/me'),
    signup: (details) => post('/api/auth/signup', details),
    login: (credentials) => post('/api/auth/login', credentials),
    logout: () => post('/api/auth/logout'),
  }
}
