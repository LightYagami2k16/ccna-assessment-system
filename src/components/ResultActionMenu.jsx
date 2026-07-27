import { useState } from 'react'

export default function ResultActionMenu({
  ariaLabel,
  options,
  onAction,
  disabledActions = [],
}) {
  const [selectedAction, setSelectedAction] = useState('')
  const [applying, setApplying] = useState(false)
  const selectedActionIsDisabled = disabledActions.includes(selectedAction)

  async function handleApply() {
    if (!selectedAction || selectedActionIsDisabled || applying) return

    try {
      setApplying(true)
      await onAction(selectedAction)
      setSelectedAction('')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="result-action-menu">
      <select
        aria-label={ariaLabel}
        value={selectedAction}
        onChange={(event) => setSelectedAction(event.target.value)}
      >
        <option value="">Select action</option>
        {options.map((option) => (
          <option
            disabled={disabledActions.includes(option.value)}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
      <button
        className={selectedAction === 'reset' ? 'danger-button' : 'primary'}
        type="button"
        disabled={!selectedAction || selectedActionIsDisabled || applying}
        onClick={() => void handleApply()}
      >
        {applying ? 'Working...' : 'OK'}
      </button>
    </div>
  )
}
