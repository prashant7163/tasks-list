import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, createApiClient } from './api'

const PUBLIC_ROUTES = new Set(['/login', '/signup'])
const utf8 = new TextEncoder()

function pathRoute() {
  return PUBLIC_ROUTES.has(window.location.pathname) ? window.location.pathname : '/tasks'
}

function navigate(path, replace = false) {
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function validate(values, fields) {
  const errors = {}
  for (const field of fields) {
    if (!values[field].trim()) errors[field] = `${field === 'displayName' ? 'Display name' : field[0].toUpperCase() + field.slice(1)} is required.`
  }
  if (!errors.displayName && values.displayName?.length > 100) errors.displayName = 'Display name must be at most 100 characters.'
  if (!errors.email && values.email?.length > 254) errors.email = 'Email must be at most 254 characters.'
  if (!errors.password && utf8.encode(values.password ?? '').length > 72) errors.password = 'Password must be at most 72 UTF-8 bytes.'
  return errors
}

const Field = forwardRef(function Field({ id, label, error, ...inputProps }, ref) {
  const errorId = `${id}-error`
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input ref={ref} id={id} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} aria-errormessage={error ? errorId : undefined} {...inputProps} />
      {error && <p className="field-error" id={errorId}>{error}</p>}
    </div>
  )
})

function AuthLayout({ children }) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <a className="brand" href="/login" onClick={(event) => { event.preventDefault(); navigate('/login') }}>Tasks</a>
        {children}
      </section>
    </main>
  )
}

function Signup({ api, onSuccess }) {
  const [values, setValues] = useState({ displayName: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState('')
  const [focusField, setFocusField] = useState(null)
  const nameRef = useRef(null)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const alertRef = useRef(null)
  const refs = { displayName: nameRef, email: emailRef, password: passwordRef }

  useEffect(() => {
    if (actionError) alertRef.current?.focus()
  }, [actionError])

  useEffect(() => {
    if (!pending && focusField) {
      refs[focusField]?.current?.focus()
      setFocusField(null)
    }
  }, [focusField, pending])

  function update(field) {
    return (event) => setValues((current) => ({ ...current, [field]: event.target.value }))
  }

  function focusFirst(nextErrors) {
    const first = ['displayName', 'email', 'password'].find((field) => nextErrors[field])
    setFocusField(first)
  }

  async function submit(event) {
    event.preventDefault()
    if (pending) return
    const nextErrors = validate(values, ['displayName', 'email', 'password'])
    setErrors(nextErrors)
    setActionError('')
    if (Object.keys(nextErrors).length) {
      focusFirst(nextErrors)
      return
    }

    setPending(true)
    try {
      await api.signup(values)
      onSuccess()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const duplicate = { email: 'Email is already registered.' }
        setErrors(duplicate)
        focusFirst(duplicate)
      } else if (error instanceof ApiError && error.status === 400 && error.payload?.errors) {
        const serverErrors = Object.fromEntries(Object.keys(error.payload.errors)
          .filter((field) => ['displayName', 'email', 'password'].includes(field))
          .map((field) => [field, `${field === 'displayName' ? 'Display name' : field[0].toUpperCase() + field.slice(1)} is invalid.`]))
        setErrors(serverErrors)
        focusFirst(serverErrors)
      } else {
        setActionError('Account could not be created. Please try again.')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout>
      <p className="eyebrow">Your private task list</p>
      <h1 id="auth-title">Create account</h1>
      <p className="intro">Start with the essentials. You’ll log in after creating your account.</p>
      {actionError && <p className="alert" role="alert" tabIndex="-1" ref={alertRef}>{actionError}</p>}
      <form noValidate onSubmit={submit}>
        <Field ref={nameRef} id="displayName" label="Display name" value={values.displayName} onChange={update('displayName')} error={errors.displayName} maxLength="100" autoComplete="name" disabled={pending} />
        <Field ref={emailRef} id="email" label="Email" value={values.email} onChange={update('email')} error={errors.email} maxLength="254" inputMode="email" autoComplete="email" disabled={pending} />
        <Field ref={passwordRef} id="password" label="Password" value={values.password} onChange={update('password')} error={errors.password} type="password" autoComplete="new-password" disabled={pending} />
        {pending && <p className="status" role="status">Creating account…</p>}
        <button className="primary" type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="switch">Already have an account? <a href="/login" onClick={(event) => { event.preventDefault(); navigate('/login') }}>Log in</a></p>
    </AuthLayout>
  )
}

function Login({ api, notice, onAuthenticated }) {
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState('')
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const alertRef = useRef(null)
  const refs = { email: emailRef, password: passwordRef }

  useEffect(() => {
    if (actionError) alertRef.current?.focus()
  }, [actionError])

  function focusFirst(nextErrors) {
    const first = ['email', 'password'].find((field) => nextErrors[field])
    refs[first]?.current?.focus()
  }

  async function submit(event) {
    event.preventDefault()
    if (pending) return
    const nextErrors = validate(values, ['email', 'password'])
    setErrors(nextErrors)
    setActionError('')
    if (Object.keys(nextErrors).length) {
      focusFirst(nextErrors)
      return
    }

    setPending(true)
    try {
      await api.login(values)
      onAuthenticated(await api.currentUser())
    } catch (error) {
      setActionError(error instanceof ApiError && error.status === 401 ? 'Email or password is incorrect.' : 'Login could not be completed. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout>
      <p className="eyebrow">Welcome back</p>
      <h1 id="auth-title">Log in</h1>
      <p className="intro">Sign in to see your private task list.</p>
      {notice && <p className="notice" role="status">{notice}</p>}
      {actionError && <p className="alert" role="alert" tabIndex="-1" ref={alertRef}>{actionError}</p>}
      <form noValidate onSubmit={submit}>
        <Field ref={emailRef} id="email" label="Email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} error={errors.email} maxLength="254" inputMode="email" autoComplete="email" disabled={pending} />
        <Field ref={passwordRef} id="password" label="Password" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} error={errors.password} type="password" autoComplete="current-password" disabled={pending} />
        {pending && <p className="status" role="status">Logging in…</p>}
        <button className="primary" type="submit" disabled={pending}>{pending ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="switch">New here? <a href="/signup" onClick={(event) => { event.preventDefault(); navigate('/signup') }}>Create an account</a></p>
    </AuthLayout>
  )
}

function TaskLanding({ api, user, onSessionEnded, onLogout }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const alertRef = useRef(null)

  async function logout() {
    if (pending) return
    setPending(true)
    setError('')
    try {
      await api.logout()
      onLogout()
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) onSessionEnded()
      else {
        setError('Logout could not be completed. Please try again.')
        requestAnimationFrame(() => alertRef.current?.focus())
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="app-page">
      <header className="app-header">
        <a className="brand" href="/tasks">Tasks</a>
        <div className="identity"><span>{user.displayName}</span><button className="secondary" type="button" onClick={logout} disabled={pending}>{pending ? 'Logging out…' : 'Log out'}</button></div>
      </header>
      <section className="task-shell" aria-labelledby="active-title">
        {error && <p className="alert" role="alert" tabIndex="-1" ref={alertRef}>{error}</p>}
        {pending && <p className="status" role="status">Logging out…</p>}
        <nav className="tabs" aria-label="Task views"><a aria-current="page" href="/tasks">Active</a><span aria-disabled="true">Completed</span></nav>
        <h1 id="active-title">Active tasks</h1>
        <p className="empty-copy">Your active tasks will appear here.</p>
      </section>
    </main>
  )
}

export default function App() {
  const api = useMemo(() => createApiClient(), [])
  const [route, setRoute] = useState(pathRoute)
  const [session, setSession] = useState({ state: 'checking', user: null })
  const [notice, setNotice] = useState('')

  useEffect(() => {
    function routeChanged() { setRoute(pathRoute()) }
    window.addEventListener('popstate', routeChanged)
    return () => window.removeEventListener('popstate', routeChanged)
  }, [])

  useEffect(() => {
    let current = true
    api.currentUser().then((user) => {
      if (!current) return
      setSession({ state: 'authenticated', user })
      if (pathRoute() !== '/tasks') navigate('/tasks', true)
    }).catch(() => {
      if (!current) return
      setSession({ state: 'anonymous', user: null })
      if (!PUBLIC_ROUTES.has(window.location.pathname)) {
        setNotice('Please log in to continue.')
        navigate('/login', true)
      }
    })
    return () => { current = false }
  }, [api])

  useEffect(() => {
    if (session.state === 'anonymous' && route === '/tasks') navigate('/login', true)
    if (session.state === 'authenticated' && route !== '/tasks') navigate('/tasks', true)
  }, [route, session.state])

  if (session.state === 'checking') return <main className="loading" role="status">Checking your session…</main>
  if (session.state === 'authenticated') {
    return <TaskLanding api={api} user={session.user} onLogout={() => { setSession({ state: 'anonymous', user: null }); setNotice('You have been logged out.'); navigate('/login', true) }} onSessionEnded={() => { setSession({ state: 'anonymous', user: null }); setNotice('Your session ended. Log in again.'); navigate('/login', true) }} />
  }
  if (route === '/signup') return <Signup api={api} onSuccess={() => { setNotice('Account created. Log in to continue.'); navigate('/login', true) }} />
  return <Login api={api} notice={notice} onAuthenticated={(user) => { setNotice(''); setSession({ state: 'authenticated', user }); navigate('/tasks', true) }} />
}
