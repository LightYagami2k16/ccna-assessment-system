import { useCallback, useEffect, useMemo, useState } from 'react'
import InstructorAttemptReview from './InstructorAttemptReview'
import { getInstructorAttempts } from '../services/instructorResultsService'

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

function resultLabel(attempt) {
  if (attempt.status === 'in_progress') return 'In progress'
  if (attempt.passed == null) return attempt.status
  return attempt.passed ? 'Passed' : 'Failed'
}

export default function InstructorResultsDashboard() {
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [quizFilter, setQuizFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedAttemptId, setSelectedAttemptId] = useState(null)

  const loadAttempts = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      setAttempts(await getInstructorAttempts())
    } catch (error) {
      const migrationHint = error.message?.includes('get_instructor_attempts')
        ? ' Run migration 005_instructor_results_dashboard.sql in Supabase first.'
        : ''
      setMessage(`${error.message}${migrationHint}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAttempts()
  }, [loadAttempts])

  const courses = useMemo(
    () => [...new Set(attempts.map((attempt) => attempt.courseCode).filter(Boolean))].sort(),
    [attempts],
  )

  const quizzes = useMemo(
    () =>
      [...new Map(attempts.map((attempt) => [attempt.quizId, attempt.quizTitle])).entries()]
        .sort((left, right) => left[1].localeCompare(right[1])),
    [attempts],
  )

  const filteredAttempts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return attempts.filter((attempt) => {
      const matchesSearch =
        !normalizedSearch ||
        attempt.studentName?.toLowerCase().includes(normalizedSearch) ||
        attempt.studentEmail?.toLowerCase().includes(normalizedSearch) ||
        attempt.quizTitle?.toLowerCase().includes(normalizedSearch)
      const matchesCourse =
        courseFilter === 'all' || attempt.courseCode === courseFilter
      const matchesQuiz = quizFilter === 'all' || attempt.quizId === quizFilter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'passed' && attempt.passed === true) ||
        (statusFilter === 'failed' && attempt.passed === false) ||
        attempt.status === statusFilter

      return matchesSearch && matchesCourse && matchesQuiz && matchesStatus
    })
  }, [attempts, courseFilter, quizFilter, search, statusFilter])

  const metrics = useMemo(() => {
    const graded = attempts.filter((attempt) => attempt.passed != null)
    const passed = graded.filter((attempt) => attempt.passed)
    const average = graded.length
      ? graded.reduce((sum, attempt) => sum + Number(attempt.percentage), 0) /
        graded.length
      : 0

    return {
      total: attempts.length,
      active: attempts.filter((attempt) => attempt.status === 'in_progress').length,
      passRate: graded.length ? (passed.length / graded.length) * 100 : 0,
      average,
    }
  }, [attempts])

  if (selectedAttemptId) {
    return (
      <InstructorAttemptReview
        attemptId={selectedAttemptId}
        onBack={() => setSelectedAttemptId(null)}
      />
    )
  }

  return (
    <section className="instructor-results">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PHASE 1.3C</span>
          <h2>Student results</h2>
          <p>Monitor attempts, scores, completion, and question-level results.</p>
        </div>
        <button className="secondary" type="button" onClick={() => void loadAttempts()}>
          Refresh results
        </button>
      </div>

      <div className="results-metrics">
        <article>
          <span>Total attempts</span>
          <strong>{metrics.total}</strong>
        </article>
        <article>
          <span>Active now</span>
          <strong>{metrics.active}</strong>
        </article>
        <article>
          <span>Pass rate</span>
          <strong>{metrics.passRate.toFixed(1)}%</strong>
        </article>
        <article>
          <span>Average score</span>
          <strong>{metrics.average.toFixed(1)}%</strong>
        </article>
      </div>

      <div className="results-filters">
        <label>
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Student, email, or quiz"
          />
        </label>
        <label>
          Course
          <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
            <option value="all">All courses</option>
            {courses.map((course) => (
              <option key={course} value={course}>{course}</option>
            ))}
          </select>
        </label>
        <label>
          Quiz
          <select value={quizFilter} onChange={(event) => setQuizFilter(event.target.value)}>
            <option value="all">All quizzes</option>
            {quizzes.map(([quizId, quizTitle]) => (
              <option key={quizId} value={quizId}>{quizTitle}</option>
            ))}
          </select>
        </label>
        <label>
          Result
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All results</option>
            <option value="in_progress">In progress</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
          </select>
        </label>
      </div>

      {message && <p className="form-message form-message--error">{message}</p>}

      {loading ? (
        <p>Loading student results…</p>
      ) : !filteredAttempts.length ? (
        <div className="empty-state">
          <h3>No matching attempts</h3>
          <p>Student attempts will appear after a quiz has been started.</p>
        </div>
      ) : (
        <div className="results-table-wrapper">
          <table className="results-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Quiz</th>
                <th>Attempt</th>
                <th>Progress</th>
                <th>Score</th>
                <th>Result</th>
                <th>Submitted</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {filteredAttempts.map((attempt) => (
                <tr key={attempt.attemptId}>
                  <td>
                    <strong>{attempt.studentName}</strong>
                    <small>{attempt.studentEmail || 'No email available'}</small>
                  </td>
                  <td>
                    <strong>{attempt.quizTitle}</strong>
                    <small>
                      {attempt.courseCode}
                      {attempt.moduleCode ? ` · ${attempt.moduleCode}` : ''}
                    </small>
                  </td>
                  <td>#{attempt.attemptNumber}</td>
                  <td>
                    {attempt.answeredCount} / {attempt.questionCount}
                    <small>{formatDuration(attempt.timeUsedSeconds)}</small>
                  </td>
                  <td>{Number(attempt.percentage).toFixed(2)}%</td>
                  <td>
                    <span
                      className={[
                        'result-status',
                        attempt.status === 'in_progress'
                          ? 'result-status--active'
                          : attempt.passed
                            ? 'result-status--passed'
                            : 'result-status--failed',
                      ].join(' ')}
                    >
                      {resultLabel(attempt)}
                    </span>
                  </td>
                  <td>{formatDate(attempt.submittedAt)}</td>
                  <td>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setSelectedAttemptId(attempt.attemptId)}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
