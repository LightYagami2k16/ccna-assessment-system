import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteStudentQuizAccommodation,
  getExamControlsWorkspace,
  grantStudentExtraAttempt,
  saveQuizAssignmentSchedule,
  saveStudentQuizAccommodation,
} from '../services/examControlService'

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null
}

function formatDate(value) {
  if (!value) return 'No limit'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function eventLabel(eventType) {
  const labels = {
    page_hidden: 'Exam page hidden',
    page_visible: 'Returned to exam',
    window_blur: 'Window lost focus',
    window_focus: 'Window regained focus',
    fullscreen_exited: 'Exited fullscreen',
    connection_lost: 'Connection lost',
    connection_restored: 'Connection restored',
  }
  return labels[eventType] ?? eventType ?? 'No events'
}

function AssignmentScheduleCard({ assignment, onSaved }) {
  const [availableFrom, setAvailableFrom] = useState(
    toLocalDateTime(assignment.availableFrom),
  )
  const [availableUntil, setAvailableUntil] = useState(
    toLocalDateTime(assignment.availableUntil),
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      await saveQuizAssignmentSchedule({
        quizId: assignment.quizId,
        classId: assignment.classId,
        availableFrom: toIso(availableFrom),
        availableUntil: toIso(availableUntil),
      })
      setMessage('Class schedule saved.')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="schedule-card">
      <span className="course-code">QUIZ SCHEDULE</span>
      <h3>{assignment.quizTitle}</h3>
      <label>
        Opens
        <input
          type="datetime-local"
          value={availableFrom}
          onChange={(event) => setAvailableFrom(event.target.value)}
        />
      </label>
      <label>
        Closes
        <input
          type="datetime-local"
          value={availableUntil}
          onChange={(event) => setAvailableUntil(event.target.value)}
        />
      </label>
      <button className="primary" type="button" disabled={saving} onClick={() => void handleSave()}>
        {saving ? 'Saving...' : 'Save schedule'}
      </button>
      {message && <p className="form-message">{message}</p>}
    </article>
  )
}

function AccommodationEditor({ students, quizzes, onSaved }) {
  const [studentId, setStudentId] = useState('')
  const [quizId, setQuizId] = useState('')
  const [extraTimeMinutes, setExtraTimeMinutes] = useState(0)
  const [extraAttempts, setExtraAttempts] = useState(0)
  const [availableFrom, setAvailableFrom] = useState('')
  const [availableUntil, setAvailableUntil] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!studentId || !quizId) {
      setMessage('Select a student and quiz.')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      await saveStudentQuizAccommodation({
        studentId,
        quizId,
        extraTimeMinutes: Number(extraTimeMinutes),
        extraAttempts: Number(extraAttempts),
        availableFrom: toIso(availableFrom),
        availableUntil: toIso(availableUntil),
      })
      setMessage('Student accommodation saved.')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="accommodation-editor" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          Student
          <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            <option value="">Select student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.fullName || student.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quiz
          <select value={quizId} onChange={(event) => setQuizId(event.target.value)}>
            <option value="">Select quiz</option>
            {quizzes.map((quiz) => (
              <option key={quiz.id} value={quiz.id}>
                {quiz.courseCode} - {quiz.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-grid form-grid--three">
        <label>
          Extra time (minutes)
          <input
            type="number"
            min="0"
            max="480"
            value={extraTimeMinutes}
            onChange={(event) => setExtraTimeMinutes(event.target.value)}
          />
        </label>
        <label>
          Extra attempts
          <input
            type="number"
            min="0"
            max="20"
            value={extraAttempts}
            onChange={(event) => setExtraAttempts(event.target.value)}
          />
        </label>
        <div className="accommodation-note">
          These values are added to the quiz’s normal duration and attempt limit.
        </div>
      </div>
      <div className="form-grid">
        <label>
          Individual opening override
          <input
            type="datetime-local"
            value={availableFrom}
            onChange={(event) => setAvailableFrom(event.target.value)}
          />
        </label>
        <label>
          Individual closing override
          <input
            type="datetime-local"
            value={availableUntil}
            onChange={(event) => setAvailableUntil(event.target.value)}
          />
        </label>
      </div>
      <button className="primary" type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save accommodation'}
      </button>
      {message && <p className="form-message">{message}</p>}
    </form>
  )
}

export default function ExamControlsDashboard() {
  const [workspace, setWorkspace] = useState({
    students: [],
    quizzes: [],
    assignments: [],
    accommodations: [],
    activeAttempts: [],
  })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [expandedClassIds, setExpandedClassIds] = useState([])
  const [expandedMonitorStudents, setExpandedMonitorStudents] = useState([])

  const loadWorkspace = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true)
      setMessage('')
      setWorkspace(await getExamControlsWorkspace())
    } catch (error) {
      setMessage(error.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkspace()
    const intervalId = window.setInterval(() => {
      void loadWorkspace({ silent: true })
    }, 10000)
    return () => window.clearInterval(intervalId)
  }, [loadWorkspace])

  const assignmentsByClass = useMemo(() => {
    const groups = new Map()

    for (const assignment of workspace.assignments) {
      if (!groups.has(assignment.classId)) {
        groups.set(assignment.classId, {
          classId: assignment.classId,
          classCode: assignment.classCode,
          className: assignment.className,
          assignments: [],
        })
      }

      groups.get(assignment.classId).assignments.push(assignment)
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        assignments: [...group.assignments].sort((left, right) =>
          left.quizTitle.localeCompare(right.quizTitle),
        ),
      }))
      .sort((left, right) => {
        const nameComparison = left.className.localeCompare(right.className)
        return nameComparison || left.classCode.localeCompare(right.classCode)
      })
  }, [workspace.assignments])

  const activeAttemptsByStudent = useMemo(() => {
    const groups = new Map()

    for (const attempt of workspace.activeAttempts) {
      const studentKey = String(
        attempt.studentEmail
        || attempt.studentName
        || attempt.attemptId,
      ).toLowerCase()

      if (!groups.has(studentKey)) {
        groups.set(studentKey, {
          studentKey,
          studentName: attempt.studentName || attempt.studentEmail || 'Student',
          eventCount: 0,
          attempts: [],
        })
      }

      const group = groups.get(studentKey)
      group.eventCount += Number(attempt.eventCount) || 0
      group.attempts.push(attempt)
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        attempts: [...group.attempts].sort(
          (left, right) =>
            new Date(right.startedAt).getTime()
            - new Date(left.startedAt).getTime(),
        ),
      }))
      .sort((left, right) =>
        left.studentName.localeCompare(right.studentName),
      )
  }, [workspace.activeAttempts])

  function isClassExpanded(classId) {
    return expandedClassIds.includes(String(classId))
  }

  function toggleClass(classId) {
    const normalizedClassId = String(classId)

    setExpandedClassIds((current) =>
      current.includes(normalizedClassId)
        ? current.filter((id) => id !== normalizedClassId)
        : [...current, normalizedClassId],
    )
  }

  function toggleMonitorStudent(studentKey) {
    setExpandedMonitorStudents((current) =>
      current.includes(studentKey)
        ? current.filter((key) => key !== studentKey)
        : [...current, studentKey],
    )
  }

  async function handleDelete(accommodation) {
    if (!window.confirm(`Remove the accommodation for ${accommodation.studentName}?`)) return
    setBusyId(accommodation.id)
    try {
      await deleteStudentQuizAccommodation(accommodation.id)
      await loadWorkspace()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleGrantAttempt(accommodation) {
    setBusyId(accommodation.id)
    try {
      await grantStudentExtraAttempt(
        accommodation.quizId,
        accommodation.studentId,
      )
      await loadWorkspace()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <section className="exam-controls">Loading exam controls...</section>

  return (
    <div className="exam-controls">
      <section className="exam-control-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CLASS SCHEDULING</span>
            <h2>Assignment schedules</h2>
            <p>Set a separate opening and closing time for each assigned class.</p>
          </div>
        </div>
        {!workspace.assignments.length ? (
          <div className="empty-state">
            <h3>No class assignments</h3>
            <p>Assign a quiz to a class before setting its schedule.</p>
          </div>
        ) : (
          <div className="assignment-class-groups">
            {assignmentsByClass.map((classGroup) => {
              const expanded = isClassExpanded(classGroup.classId)
              const panelId = `assignment-class-panel-${classGroup.classId}`

              return (
                <section
                  className="assignment-class-group"
                  key={classGroup.classId}
                >
                  <header className="assignment-class-group__heading">
                    <div>
                      <span className="course-code">
                        {classGroup.classCode}
                      </span>
                      <h3>{classGroup.className}</h3>
                    </div>

                    <div className="assignment-class-group__collapse-controls">
                      <span className="status-chip">
                        {classGroup.assignments.length}{' '}
                        {classGroup.assignments.length === 1
                          ? 'quiz'
                          : 'quizzes'}
                      </span>

                      <button
                        className="assignment-class-collapse-button"
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => toggleClass(classGroup.classId)}
                      >
                        {expanded ? 'Hide schedules' : 'Show schedules'}
                      </button>
                    </div>
                  </header>

                  {expanded && (
                    <div id={panelId}>
                      <div className="schedule-card-grid">
                        {classGroup.assignments.map((assignment) => (
                          <AssignmentScheduleCard
                            key={`${assignment.id}-${assignment.availableFrom}-${assignment.availableUntil}`}
                            assignment={assignment}
                            onSaved={loadWorkspace}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </section>

      <section className="exam-control-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ACCOMMODATIONS</span>
            <h2>Individual student controls</h2>
            <p>Grant extra time, extra attempts, or an individual availability window.</p>
          </div>
        </div>
        <AccommodationEditor
          students={workspace.students}
          quizzes={workspace.quizzes}
          onSaved={loadWorkspace}
        />

        {!!workspace.accommodations.length && (
          <div className="accommodation-table-wrapper">
            <table className="accommodation-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Quiz</th>
                  <th>Extra time</th>
                  <th>Extra attempts</th>
                  <th>Availability override</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workspace.accommodations.map((accommodation) => (
                  <tr key={accommodation.id}>
                    <td>{accommodation.studentName}</td>
                    <td>{accommodation.quizTitle}</td>
                    <td>{accommodation.extraTimeMinutes} minutes</td>
                    <td>{accommodation.extraAttempts}</td>
                    <td>
                      <small>
                        {formatDate(accommodation.availableFrom)}
                        <br />
                        to {formatDate(accommodation.availableUntil)}
                      </small>
                    </td>
                    <td>
                      <div className="exam-control-actions">
                        <button
                          className="primary"
                          type="button"
                          disabled={busyId === accommodation.id}
                          onClick={() => void handleGrantAttempt(accommodation)}
                        >
                          Grant +1 attempt
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={busyId === accommodation.id}
                          onClick={() => void handleDelete(accommodation)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="exam-control-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LIVE MONITORING</span>
            <h2>Active attempts</h2>
            <p>Updates automatically every 10 seconds. Events are indicators for review.</p>
          </div>
          <button className="secondary" type="button" onClick={() => void loadWorkspace()}>
            Refresh now
          </button>
        </div>
        {!workspace.activeAttempts.length ? (
          <div className="empty-state">
            <h3>No active attempts</h3>
            <p>Students currently taking an exam will appear here.</p>
          </div>
        ) : (
          <div className="monitor-student-groups">
            {activeAttemptsByStudent.map((studentGroup) => {
              const expanded = expandedMonitorStudents.includes(
                studentGroup.studentKey,
              )
              const panelId = `monitor-student-${studentGroup.studentKey
                .replace(/[^a-z0-9]+/g, '-')}`

              return (
                <section
                  className="monitor-student-group"
                  key={studentGroup.studentKey}
                >
                  <button
                    className="monitor-student-summary"
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() =>
                      toggleMonitorStudent(studentGroup.studentKey)
                    }
                  >
                    <strong>{studentGroup.studentName}</strong>
                    <span className="monitor-student-summary__events">
                      {studentGroup.eventCount}{' '}
                      {studentGroup.eventCount === 1 ? 'event' : 'events'}
                    </span>
                    <span
                      className="monitor-student-summary__chevron"
                      aria-hidden="true"
                    >
                      {expanded ? '−' : '+'}
                    </span>
                  </button>

                  {expanded && (
                    <div
                      className="monitor-student-attempts"
                      id={panelId}
                    >
                      <div className="monitor-card-grid">
                        {studentGroup.attempts.map((attempt) => (
                          <article
                            className="monitor-card"
                            key={attempt.attemptId}
                          >
                            <header>
                              <span
                                className={
                                  attempt.assessmentType === 'cli'
                                    ? 'monitor-type-badge monitor-type-badge--cli'
                                    : 'monitor-type-badge'
                                }
                              >
                                {attempt.assessmentType === 'cli'
                                  ? 'CLI practical'
                                  : 'Quiz'}
                              </span>
                              <span className="integrity-count">
                                {attempt.eventCount}{' '}
                                {Number(attempt.eventCount) === 1
                                  ? 'event'
                                  : 'events'}
                              </span>
                            </header>
                            <strong>
                              {attempt.assessmentTitle || attempt.quizTitle}
                            </strong>
                            <dl>
                              <div>
                                <dt>Started</dt>
                                <dd>{formatDate(attempt.startedAt)}</dd>
                              </div>
                              <div>
                                <dt>Expires</dt>
                                <dd>{formatDate(attempt.expiresAt)}</dd>
                              </div>
                              <div>
                                <dt>Latest event</dt>
                                <dd>{eventLabel(attempt.latestEvent?.type)}</dd>
                              </div>
                              {attempt.assessmentType === 'cli' && (
                                <div>
                                  <dt>Commands entered</dt>
                                  <dd>{attempt.commandCount ?? 0}</dd>
                                </div>
                              )}
                            </dl>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </section>

      {message && <p className="form-message form-message--error">{message}</p>}
    </div>
  )
}
