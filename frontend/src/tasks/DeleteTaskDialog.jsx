import { useEffect, useRef } from 'react'

export default function DeleteTaskDialog({ task, pending, onCancel, onConfirm }) {
  const cancelRef = useRef(null)
  useEffect(() => { cancelRef.current?.focus() }, [])

  function handleKeyDown(event) {
    if (event.key === 'Escape' && !pending) {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll('button:not([disabled])')]
    if (!controls.length) {
      event.preventDefault()
      return
    }
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="dialog-backdrop">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-copy" onKeyDown={handleKeyDown}>
        <h2 id="delete-title">Delete task?</h2>
        <p id="delete-copy">“{task.title}” will be permanently deleted.</p>
        <div className="form-actions">
          <button ref={cancelRef} className="secondary" type="button" onClick={onCancel} disabled={pending}>Cancel</button>
          <button className="danger" type="button" onClick={onConfirm} disabled={pending}>Delete task</button>
        </div>
      </section>
    </div>
  )
}
