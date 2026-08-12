import { useEffect, useId, useRef } from 'react'
import { AlertTriangle, CircleHelp, X } from 'lucide-react'
import AppIcon from './AppIcon'

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
        <div className="confirmation-dialog__heading">
          <span
            className={`confirmation-dialog__icon confirmation-dialog__icon--${tone}`}
          >
            <AppIcon
              icon={tone === 'danger' ? AlertTriangle : CircleHelp}
              size="lg"
            />
          </span>
          <div className="confirmation-dialog__copy">
            <span className="eyebrow">
              {tone === 'danger' ? 'CONFIRM ACTION' : 'PLEASE CONFIRM'}
            </span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{message}</p>
          </div>
          <button
            className="confirmation-dialog__close"
            type="button"
            aria-label="Close confirmation"
            onClick={onCancel}
          >
            <AppIcon icon={X} size="sm" />
          </button>
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
