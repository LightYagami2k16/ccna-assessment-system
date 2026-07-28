import { useEffect, useId, useRef } from 'react'

export default function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      onCancel()
    }
  }

  return (
    <dialog
      className="confirmation-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      onClick={handleBackdropClick}
    >
      <div className="confirmation-dialog__content">
        <div>
          <span className="eyebrow">
            {tone === 'danger' ? 'CONFIRM ACTION' : 'PLEASE CONFIRM'}
          </span>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{message}</p>
        </div>

        <div className="confirmation-dialog__actions">
          <button
            className="secondary"
            type="button"
            autoFocus
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={tone === 'danger' ? 'danger-button' : 'primary'}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
