import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import AppIcon from './AppIcon'

function display(value, suffix = '') {
  return value === null || value === undefined || value === '' ? 'Not provided' : `${value}${suffix}`
}

function deadline(value) {
  if (!value) return 'No deadline'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString()
}

function AssessmentDetails({ assessment }) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const fields = [
    ['Assessment type', assessment.assessmentType === 'quiz' ? 'Quiz' : 'CLI practical'],
    ['Course', [assessment.courseCode, assessment.courseTitle].filter(Boolean).join(' · ') || 'CCNA'],
    ['Module', [assessment.moduleCode, assessment.moduleTitle].filter(Boolean).join(' · ') || 'General'],
    ['Duration', display(assessment.durationMinutes, ' minutes')],
    ['Passing score', display(assessment.passingScore, '%')],
    ['Maximum attempts', display(assessment.maxAttempts)],
    ['Attempts used', display(assessment.attemptsUsed)],
    ['Attempts remaining', display(assessment.attemptsRemaining)],
    ...(assessment.assessmentType === 'quiz' ? [['Deadline', deadline(assessment.availableUntil)]]
      : assessment.deviceType ? [['Device type', assessment.deviceType]] : []),
  ]

  return <section className="student-assessment-details__item">
    <div className="student-assessment-details__item-heading">
      <h3>{assessment.title}</h3>
      <button className="secondary student-assessment-details__toggle" type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((current) => !current)}>
        {expanded ? 'Hide details' : 'Show details'}<AppIcon icon={expanded ? ChevronUp : ChevronDown} aria-hidden="true" />
      </button>
    </div>
    <div id={detailsId} className="student-assessment-details__body" hidden={!expanded}>
    <p className="student-assessment-details__description">{assessment.description || 'No description provided.'}</p>
    <dl className="student-assessment-details__fields">
      {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    </div>
  </section>
}

export default function StudentAssessmentDetails({ category, onClose }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (category && !dialog.open) dialog.showModal()
    else if (!category && dialog.open) dialog.close()
  }, [category])

  function handleKeyDown(event) {
    if (event.key !== 'Tab') return
    const buttons = event.currentTarget.querySelectorAll('button:not(:disabled)')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return <dialog className="confirmation-dialog student-assessment-details" ref={dialogRef} aria-labelledby={titleId} onKeyDown={handleKeyDown}
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    {category && <div className="confirmation-dialog__content">
      <header className="student-assessment-details__heading">
        <div><span className="eyebrow">ASSESSMENT DETAILS</span><h2 id={titleId}>{category.title}</h2><p>{category.items.length} available</p></div>
        <button className="confirmation-dialog__close" type="button" aria-label="Close details" onClick={onClose} autoFocus><AppIcon icon={X} /></button>
      </header>
      {category.items.map((assessment) => <AssessmentDetails key={`${assessment.assessmentType}:${assessment.id}`} assessment={assessment} />)}
      <div className="confirmation-dialog__actions">
        <button className="secondary" type="button" onClick={onClose}>Done</button>
        <button className="primary" type="button" onClick={() => { onClose(); category.onOpen() }}>{category.action}</button>
      </div>
    </div>}
  </dialog>
}
