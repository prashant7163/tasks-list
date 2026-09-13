import { forwardRef, useEffect, useRef, useState } from 'react'

const TaskField = forwardRef(function TaskField({ id, label, error, multiline = false, ...props }, ref) {
  const errorId = `${id}-error`
  const common = {
    ref,
    id,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? errorId : undefined,
    'aria-errormessage': error ? errorId : undefined,
    ...props,
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea {...common} /> : <input {...common} />}
      {error && <p className="field-error" id={errorId}>{error}</p>}
    </div>
  )
})

function validate(values) {
  const errors = {}
  if (!values.title.trim()) errors.title = 'Title is required.'
  else if (values.title.length > 120) errors.title = 'Title must be at most 120 characters.'
  if (!values.description.trim()) errors.description = 'Description is required.'
  else if (values.description.length > 1000) errors.description = 'Description must be at most 1,000 characters.'
  return errors
}

export default function TaskForm({ task, pending, onSubmit, onCancel }) {
  const editing = Boolean(task)
  const [values, setValues] = useState({ title: task?.title ?? '', description: task?.description ?? '' })
  const [errors, setErrors] = useState({})
  const titleRef = useRef(null)
  const descriptionRef = useRef(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  async function submit(event) {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      if (nextErrors.title) titleRef.current?.focus()
      else descriptionRef.current?.focus()
      return
    }
    await onSubmit(values)
  }

  return (
    <form className="task-form" noValidate onSubmit={submit} aria-label={editing ? `Edit ${task.title}` : 'Create task'}>
      <h2>{editing ? 'Edit task' : 'New task'}</h2>
      <TaskField ref={titleRef} id="task-title" label="Title" value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} error={errors.title} maxLength="121" disabled={pending} />
      <TaskField ref={descriptionRef} id="task-description" label="Description" value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} error={errors.description} maxLength="1001" disabled={pending} multiline rows="5" />
      <div className="form-actions">
        <button className="primary compact" type="submit" disabled={pending}>{editing ? 'Save changes' : 'Create task'}</button>
        <button className="secondary" type="button" onClick={onCancel} disabled={pending}>Cancel</button>
      </div>
    </form>
  )
}
