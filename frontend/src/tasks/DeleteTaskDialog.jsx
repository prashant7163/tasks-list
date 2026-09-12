import { useEffect, useRef } from 'react'

export default function DeleteTaskDialog({ task, pending, onCancel, onConfirm }) {
  const cancelRef = useRef(null)
  useEffect(() => { cancelRef.current?.focus() }, [])

  return (
    <div className="dialog-backdrop">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-copy">
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
