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
            {assignmentsByClass.map((classGroup) => (
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
                  <span className="status-chip">
                    {classGroup.assignments.length}{' '}
                    {classGroup.assignments.length === 1
                      ? 'quiz'
                      : 'quizzes'}
                  </span>
                </header>

                <div className="schedule-card-grid">
                  {classGroup.assignments.map((assignment) => (
                    <AssignmentScheduleCard
                      key={`${assignment.id}-${assignment.availableFrom}-${assignment.availableUntil}`}
                      assignment={assignment}
                      onSaved={loadWorkspace}
                    />
                  ))}
                </div>
              </section>
            ))}
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
          <div className="monitor-card-grid">
            {workspace.activeAttempts.map((attempt) => (
              <article className="monitor-card" key={attempt.attemptId}>
                <header>
                  <div>
                    <h3>{attempt.studentName}</h3>
                    <small>{attempt.studentEmail}</small>
                  </div>
                  <span className="integrity-count">
                    {attempt.eventCount} events
                  </span>
                </header>
                <strong>{attempt.quizTitle}</strong>
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
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      {message && <p className="form-message form-message--error">{message}</p>}
    </div>
  )
}
