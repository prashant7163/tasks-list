import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from './api'

function response(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  })
}

describe('authentication API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('sends cookies on current-user requests', async () => {
    fetch.mockResolvedValueOnce(response(200, { displayName: 'Ada', email: 'ada@example.com' }))

    await createApiClient().currentUser()

    expect(fetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'include' }))
  })

  it('fetches a fresh CSRF token in memory before every state-changing request', async () => {
    fetch
      .mockResolvedValueOnce(response(200, {
        headerName: 'X-CSRF-TOKEN',
        parameterName: '_csrf',
        token: 'first-token',
      }))
      .mockResolvedValueOnce(response(200, { authenticated: true }))
      .mockResolvedValueOnce(response(200, {
        headerName: 'X-CSRF-TOKEN',
        parameterName: '_csrf',
        token: 'second-token',
      }))
      .mockResolvedValueOnce(response(204))

    const client = createApiClient()
    await client.login({ email: 'ada@example.com', password: 'secret' })
    await client.logout()

    expect(fetch.mock.calls).toEqual([
      ['/api/auth/csrf', { credentials: 'include' }],
      ['/api/auth/login', expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'first-token' },
        body: JSON.stringify({ email: 'ada@example.com', password: 'secret' }),
      })],
      ['/api/auth/csrf', { credentials: 'include' }],
      ['/api/auth/logout', expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'second-token' },
      })],
    ])
    expect(localStorage).toHaveLength(0)
    expect(sessionStorage).toHaveLength(0)
  })
})
