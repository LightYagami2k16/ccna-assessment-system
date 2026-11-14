import { useLayoutEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import AppIcon from './AppIcon'

export default function LibraryItemDialog({ open, title, onClose, children, eyebrow = 'ASSESSMENT DETAILS' }) {
  const ref = useRef(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
    return () => {
      if (dialog.open) dialog.close()
      if (open && opener?.isConnected) opener.focus()
    }
  }, [open])

  function handleKeyDown(event) {
    if (event.key !== 'Tab' || event.target.closest('dialog') !== ref.current) return
    const controls = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
      .filter((element) => element.closest('dialog') === ref.current && element.getClientRects().length > 0)
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return <dialog ref={ref} className="confirmation-dialog library-item-details" aria-labelledby={titleId} onKeyDown={handleKeyDown}
    onCancel={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); onClose() }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
    }}>
    {open && <div className="confirmation-dialog__content">
      <header className="library-item-details__heading">
        <div><span className="eyebrow">{eyebrow}</span><h2 id={titleId}>{title}</h2></div>
        <button className="confirmation-dialog__close" type="button" aria-label="Close details" onClick={onClose} autoFocus><AppIcon icon={X} /></button>
      </header>
      <div className="library-item-details__body">{children}</div>
      <div className="confirmation-dialog__actions"><button className="secondary" type="button" onClick={onClose}>Done</button></div>
    </div>}
  </dialog>
}
