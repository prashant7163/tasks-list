import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App'

function response(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  })
}

function queueResponses(...responses) {
  vi.stubGlobal('fetch', vi.fn())
  responses.forEach((value) => fetch.mockResolvedValueOnce(value))
}

function csrf(token = 'csrf-token') {
  return response(200, { headerName: 'X-CSRF-TOKEN', parameterName: '_csrf', token })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

it('redirects an unauthenticated protected route without revealing protected content', async () => {
  window.history.replaceState({}, '', '/tasks')
  queueResponses(response(401, { error: 'Authentication required' }))

  render(<App />)

  expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
  expect(screen.queryByRole('heading', { name: 'Active tasks' })).not.toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/login')
})

it('associates bounded signup errors with fields and focuses the first invalid field', async () => {
  window.history.replaceState({}, '', '/signup')
  queueResponses(response(401, { error: 'Authentication required' }))
  const user = userEvent.setup()
  render(<App />)

  const name = await screen.findByLabelText('Display name')
  await user.type(screen.getByLabelText('Password'), 'é'.repeat(37))
  await user.click(screen.getByRole('button', { name: 'Create account' }))

  expect(name).toHaveFocus()
  expect(name).toHaveAccessibleErrorMessage('Display name is required.')
  expect(screen.getByLabelText('Email')).toHaveAccessibleErrorMessage('Email is required.')
  expect(screen.getByLabelText('Password')).toHaveAccessibleErrorMessage('Password must be at most 72 UTF-8 bytes.')
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('shows duplicate signup as an email error without exposing server detail', async () => {
  window.history.replaceState({}, '', '/signup')
  queueResponses(
    response(401, { error: 'Authentication required' }),
    csrf(),
    response(409, { error: 'Unable to create account' }),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.type(await screen.findByLabelText('Display name'), 'Ada')
  await user.type(screen.getByLabelText('Email'), ' Ada@Example.com ')
  await user.type(screen.getByLabelText('Password'), 'correct horse battery staple')
  await user.click(screen.getByRole('button', { name: 'Create account' }))

  const email = screen.getByLabelText('Email')
  await waitFor(() => expect(email).toHaveAccessibleErrorMessage('Email is already registered.'))
  expect(email).toHaveFocus()
  expect(screen.queryByText('Unable to create account')).not.toBeInTheDocument()
})

it('returns to Login with an announced success and no authenticated session after signup', async () => {
  window.history.replaceState({}, '', '/signup')
  queueResponses(response(401, { error: 'Authentication required' }), csrf(), response(201, { registered: true }))
  const user = userEvent.setup()
  render(<App />)

  await user.type(await screen.findByLabelText('Display name'), 'Ada')
  await user.type(screen.getByLabelText('Email'), 'ada@example.com')
  await user.type(screen.getByLabelText('Password'), 'correct horse battery staple')
  await user.click(screen.getByRole('button', { name: 'Create account' }))

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Account created. Log in to continue.')
  expect(window.location.pathname).toBe('/login')
  expect(fetch).toHaveBeenCalledTimes(3)
})

it('uses one generic login failure and moves focus to it', async () => {
  queueResponses(response(401, { error: 'Authentication required' }), csrf(), response(401, { error: 'Invalid credentials' }))
  const user = userEvent.setup()
  render(<App />)

  await user.type(await screen.findByLabelText('Email'), 'unknown@example.com')
  await user.type(screen.getByLabelText('Password'), 'wrong')
  await user.click(screen.getByRole('button', { name: 'Log in' }))

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Email or password is incorrect.')
  expect(alert).toHaveFocus()
})

it('prevents duplicate login submissions and announces pending state', async () => {
  let finishLogin
  const pendingLogin = new Promise((resolve) => { finishLogin = resolve })
  queueResponses(response(401, { error: 'Authentication required' }), csrf(), pendingLogin)
  const user = userEvent.setup()
  render(<App />)

  await user.type(await screen.findByLabelText('Email'), 'ada@example.com')
  await user.type(screen.getByLabelText('Password'), 'secret')
  await user.click(screen.getByRole('button', { name: 'Log in' }))

  expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Logging in…')
  expect(fetch).toHaveBeenCalledTimes(3)
  finishLogin(response(401, { error: 'Invalid credentials' }))
  await screen.findByRole('alert')
})

it('opens the protected Active landing after a successful login', async () => {
  queueResponses(
    response(401, { error: 'Authentication required' }),
    csrf(),
    response(200, { authenticated: true }),
    response(200, { displayName: 'Ada Lovelace', email: 'ada@example.com' }),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.type(await screen.findByLabelText('Email'), 'ada@example.com')
  await user.type(screen.getByLabelText('Password'), 'correct horse battery staple')
  await user.click(screen.getByRole('button', { name: 'Log in' }))

  expect(await screen.findByRole('heading', { name: 'Active tasks' })).toBeInTheDocument()
  expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/tasks')
})

it('logs out and does not restore protected content through browser history', async () => {
  window.history.replaceState({}, '', '/tasks')
  queueResponses(
    response(200, { displayName: 'Ada', email: 'ada@example.com' }),
    csrf('logout-token'),
    response(204),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: 'Log out' }))

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/login')
  expect(screen.queryByText('Ada')).not.toBeInTheDocument()
})

it('returns an expired protected session to Login with a safe announcement', async () => {
  window.history.replaceState({}, '', '/tasks')
  queueResponses(
    response(200, { displayName: 'Ada', email: 'ada@example.com' }),
    csrf(),
    response(401, { error: 'Authentication required' }),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.click(await screen.findByRole('button', { name: 'Log out' }))

  expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Your session ended. Log in again.')
  expect(screen.queryByText('Ada')).not.toBeInTheDocument()
})
