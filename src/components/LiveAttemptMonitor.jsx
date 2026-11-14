import { useMemo, useState } from 'react'
import { submitMonitoredAttempt } from '../services/examControlService'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import { ActionBar, ResponsiveGrid, SurfaceCard } from './LayoutPrimitives'

const typeLabel = (type) => type === 'cli' ? 'CLI practical' : 'Quiz'
const attemptKey = (attempt) => `${attempt.assessmentType}:${attempt.attemptId}`
// Missing metadata must never merge different exams with the same title.
const assessmentKey = (attempt) => `${attempt.assessmentType}:${attempt.assessmentId || `attempt-${attempt.attemptId}`}`
const assessmentTitle = (attempt) => attempt.assessmentTitle || attempt.quizTitle || 'Untitled assessment'
const classKey = (attempt) => String(attempt.classId || 'unassigned')
const classLabel = (attempt) => attempt.className || 'Unassigned or unresolved class'
const studentKey = (attempt) => attempt.studentId || attempt.studentEmail || attempt.attemptId
const countLabel = (count, label) => `${count} ${label}${count === 1 ? '' : 's'}`

function formatDate(value) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'No limit'
}

function eventLabel(type) {
  return ({ page_hidden: 'Exam page hidden', page_visible: 'Returned to exam', window_blur: 'Window lost focus',
    window_focus: 'Window regained focus', fullscreen_exited: 'Exited fullscreen', connection_lost: 'Connection lost',
    connection_restored: 'Connection restored' })[type] || type || 'No events'
}

export default function LiveAttemptMonitor({ attempts, controlsAvailable, onSubmitted }) {
  const [studentSearch, setStudentSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [assessmentFilter, setAssessmentFilter] = useState('all')
  const [expandedClasses, setExpandedClasses] = useState([])
  const [collapsedAssessments, setCollapsedAssessments] = useState([])
  const [expandedAttempts, setExpandedAttempts] = useState([])
  const [endedAttempts, setEndedAttempts] = useState([])
  const [busyKey, setBusyKey] = useState(null)
  const [notice, setNotice] = useState(null)
  const { confirm, confirmationDialog } = useConfirmationDialog()
  const studentQuery = studentSearch.trim().toLocaleLowerCase()
  const filtering = Boolean(studentQuery) || classFilter !== 'all' || typeFilter !== 'all' || assessmentFilter !== 'all'
  const active = attempts.filter((attempt) => !endedAttempts.includes(attemptKey(attempt)))
  const classes = [...new Map(active.map((attempt) => [classKey(attempt), classLabel(attempt)])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
  const assessments = [...new Map(active.filter((attempt) =>
    (classFilter === 'all' || classKey(attempt) === classFilter)
    && (typeFilter === 'all' || attempt.assessmentType === typeFilter))
    .map((attempt) => [assessmentKey(attempt), `${typeLabel(attempt.assessmentType)} · ${assessmentTitle(attempt)}${attempt.courseCode ? ` · ${attempt.courseCode}` : ''}`])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))

  const groups = useMemo(() => {
    const grouped = new Map()
    for (const attempt of attempts) {
      if (endedAttempts.includes(attemptKey(attempt))
        || (studentQuery && !String(attempt.studentName || '').toLocaleLowerCase().includes(studentQuery))
        || (classFilter !== 'all' && classKey(attempt) !== classFilter)
        || (typeFilter !== 'all' && attempt.assessmentType !== typeFilter)
        || (assessmentFilter !== 'all' && assessmentKey(attempt) !== assessmentFilter)) continue
      const classId = classKey(attempt)
      if (!grouped.has(classId)) grouped.set(classId, { id: classId, name: classLabel(attempt), code: attempt.classCode || 'UNASSIGNED', assessments: new Map() })
      const classGroup = grouped.get(classId)
      const key = assessmentKey(attempt)
      if (!classGroup.assessments.has(key)) classGroup.assessments.set(key, { key, title: assessmentTitle(attempt), type: attempt.assessmentType, attempts: [] })
      classGroup.assessments.get(key).attempts.push(attempt)
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name)).map((group) => ({
      ...group, assessments: [...group.assessments.values()].sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key)),
    }))
  }, [attempts, endedAttempts, classFilter, typeFilter, assessmentFilter, studentQuery])
  const visibleCount = groups.reduce((total, group) => total + group.assessments.reduce((count, assessment) => count + assessment.attempts.length, 0), 0)

  function toggle(setter, key) {
    setter((current) => current.includes(key) ? current.filter((id) => id !== key) : [...current, key])
  }

  async function submit(attempt) {
    if (busyKey) return
    const key = attemptKey(attempt)
    // Reserve the action before opening the dialog to prevent duplicate requests.
    setBusyKey(key)
    try {
      const confirmed = await confirm({ title: 'Submit this student’s attempt?',
        message: `Submit ${attempt.studentName || attempt.studentEmail || 'this student'}’s ${typeLabel(attempt.assessmentType).toLowerCase()} “${assessmentTitle(attempt)}”? This ends the attempt and grades only work already saved to the server. Unsaved or offline work is excluded. The action is recorded and cannot be undone here.`,
        confirmLabel: 'Submit attempt', tone: 'danger' })
      if (!confirmed) return
      setNotice(null)
      const result = await submitMonitoredAttempt(attempt)
      setEndedAttempts((current) => [...current, key])
      setNotice({ error: false, text: result?.alreadyCompleted ? 'The attempt had already ended. Its result was not changed.' : `Submitted ${attempt.studentName || 'the student'}’s attempt.` })
      await onSubmitted()
    } catch (error) {
      setNotice({ error: true, text: error.message })
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="live-attempt-monitor">
      {confirmationDialog}
      {!controlsAvailable && <p className="form-message" role="status">Assessment grouping and instructor submission require database migration 068. Submission is unavailable until it is applied.</p>}
      <div className="monitor-filters">
        <label>Student name<input type="search" placeholder="Search student name" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} /></label>
        <label>Class<select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setAssessmentFilter('all') }}>
          <option value="all">All classes</option>
          {classes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          {classFilter !== 'all' && !classes.some(([key]) => key === classFilter) && <option value={classFilter}>Selected class (no active attempts)</option>}
        </select></label>
        <label>Assessment type<select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setAssessmentFilter('all') }}>
          <option value="all">Quizzes and CLI practicals</option><option value="quiz">Quizzes</option><option value="cli">CLI practicals</option>
        </select></label>
        <label>Assessment<select value={assessmentFilter} onChange={(event) => setAssessmentFilter(event.target.value)}>
          <option value="all">All assessments</option>
          {assessments.map(([key, label]) => <option key={key} value={key}>{label}{assessments.filter(([, other]) => other === label).length > 1 ? ` (${key.split(':').slice(1).join(':')})` : ''}</option>)}
          {assessmentFilter !== 'all' && !assessments.some(([key]) => key === assessmentFilter) && <option value={assessmentFilter}>Selected assessment (no active attempts)</option>}
        </select></label>
        <button className="secondary" type="button" disabled={!filtering && !studentSearch} onClick={() => { setStudentSearch(''); setClassFilter('all'); setTypeFilter('all'); setAssessmentFilter('all') }}>Clear filters</button>
      </div>
      <p className="monitor-filter-count">Showing {visibleCount} of {active.length} active attempts.</p>
      {notice && <p className={`form-message${notice.error ? ' form-message--error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      {!groups.length ? <div className="empty-state"><h3>{active.length ? 'No matching active attempts' : filtering ? 'No matching active attempts' : 'No active attempts'}</h3><p>{filtering ? 'Change or clear the filters to view other attempts.' : 'Students currently taking an exam will appear here.'}</p></div> : (
        <div className="monitor-class-groups">
          {groups.map((group) => {
            const open = filtering || expandedClasses.includes(group.id)
            const panelId = `monitor-class-${encodeURIComponent(group.id)}`
            const groupAttempts = group.assessments.flatMap((assessment) => assessment.attempts)
            return <section className="monitor-class-group" key={group.id}>
              <button className="monitor-class-summary" type="button" aria-expanded={open} aria-controls={panelId} disabled={filtering} onClick={() => toggle(setExpandedClasses, group.id)}>
                <span className="course-code">{group.code}</span><strong>{group.name}</strong><span>{countLabel(new Set(groupAttempts.map(studentKey)).size, 'student')} · {countLabel(groupAttempts.length, 'attempt')}</span><span className="monitor-student-summary__events">{countLabel(groupAttempts.reduce((sum, attempt) => sum + (Number(attempt.eventCount) || 0), 0), 'event')}</span><span aria-hidden="true">{open ? '−' : '+'}</span>
              </button>
              {open && <div className="monitor-assessment-groups" id={panelId}>
                {group.assessments.map((assessment) => {
                  const groupKey = `${group.id}:${assessment.key}`
                  const expanded = filtering || !collapsedAssessments.includes(groupKey)
                  const assessmentPanelId = `monitor-assessment-${encodeURIComponent(groupKey)}`
                  return <section className="monitor-assessment-group" key={assessment.key}>
                    <button className="monitor-assessment-summary" type="button" aria-expanded={expanded} aria-controls={assessmentPanelId} disabled={filtering} onClick={() => toggle(setCollapsedAssessments, groupKey)}>
                      <span className={`monitor-type-badge${assessment.type === 'cli' ? ' monitor-type-badge--cli' : ''}`}>{typeLabel(assessment.type)}</span><strong>{assessment.title}</strong><span>{assessment.attempts.length} active</span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
                    </button>
                    {expanded && <ResponsiveGrid id={assessmentPanelId} min="17.5rem" className="monitor-card-grid">
                      {assessment.attempts.map((attempt) => <SurfaceCard as="article" subtle className="monitor-card" key={attemptKey(attempt)}>
                        <header><div><strong>{attempt.studentName || attempt.studentEmail || 'Student'}</strong><small>{attempt.studentEmail}</small></div><span className="integrity-count">{countLabel(Number(attempt.eventCount) || 0, 'event')}</span></header>
                        <button className="secondary monitor-details-toggle" type="button"
                          aria-expanded={expandedAttempts.includes(attemptKey(attempt))}
                          aria-controls={`monitor-attempt-${encodeURIComponent(attemptKey(attempt))}`}
                          onClick={() => toggle(setExpandedAttempts, attemptKey(attempt))}>
                          {expandedAttempts.includes(attemptKey(attempt)) ? 'Hide details' : 'Show details'}
                        </button>
                        <div className="monitor-attempt-details"
                          id={`monitor-attempt-${encodeURIComponent(attemptKey(attempt))}`}
                          hidden={!expandedAttempts.includes(attemptKey(attempt))}>
                        <dl>
                          <div><dt>Started</dt><dd>{formatDate(attempt.startedAt)}</dd></div>
                          <div><dt>Expires</dt><dd>{formatDate(attempt.expiresAt)}</dd></div>
                          <div><dt>Latest event</dt><dd>{eventLabel(attempt.latestEvent?.type)}</dd></div>
                          <div><dt>Browser session</dt><dd><span className={`monitor-session-status monitor-session-status--${attempt.clientSession?.status || 'not_connected'}`}>{({ connected: 'Connected', delayed: 'Connection delayed', stale: 'Session reclaimable', not_connected: 'Not connected' })[attempt.clientSession?.status] || 'Not connected'}</span>{attempt.clientSession?.clientLabel && <small>{attempt.clientSession.clientLabel}</small>}</dd></div>
                          {attempt.clientSession?.heartbeatAt && <div><dt>Last session contact</dt><dd>{formatDate(attempt.clientSession.heartbeatAt)}</dd></div>}
                          {attempt.assessmentType === 'cli' && <div><dt>Commands entered</dt><dd>{attempt.commandCount || 0}</dd></div>}
                        </dl>
                        <ActionBar><button className="danger-button" type="button" disabled={!controlsAvailable || !attempt.assessmentId || Boolean(busyKey)} onClick={() => void submit(attempt)}>{busyKey === attemptKey(attempt) ? 'Submitting…' : 'Submit attempt'}</button></ActionBar>
                        </div>
                      </SurfaceCard>)}
                    </ResponsiveGrid>}
                  </section>
                })}
              </div>}
            </section>
          })}
        </div>
      )}
    </div>
  )
}
