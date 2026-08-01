import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getStudentQuizArchiveStatuses,
  getStudentRecentResults,
  setStudentQuizArchived,
} from '../services/quizAttemptService'

function formatDate(value) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function StudentRecentResults({ onRestored }) {
  const [results, setResults] = useState([])
  const [archiveStatuses, setArchiveStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [restoringQuizId, setRestoringQuizId] = useState(null)
  const [message, setMessage] = useState('')

  const loadResults = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      const [resultData, archiveData] = await Promise.all([
        getStudentRecentResults(50),
        getStudentQuizArchiveStatuses(),
      ])
      setResults(resultData)
      setArchiveStatuses(archiveData)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadResults()
  }, [loadResults])

  const resultsByQuiz = useMemo(() => {
    const groups = new Map()
    const statusByQuiz = Object.fromEntries(
      archiveStatuses.map((status) => [status.quizId, status]),
    )

    for (const result of results) {
      if (!groups.has(result.quizId)) {
        groups.set(result.quizId, {
          quizId: result.quizId,
          quizTitle: result.quizTitle,
          courseCode: result.courseCode,
          moduleCode: result.moduleCode,
          attempts: [],
        })
      }
      groups.get(result.quizId).attempts.push(result)
    }

    return Array.from(groups.values()).map((group) => ({
      ...group,
      lifecycle: statusByQuiz[group.quizId],
    }))
  }, [archiveStatuses, results])

  async function handleRestore(quizId) {
    try {
      setRestoringQuizId(quizId)
      setMessage('')
      await setStudentQuizArchived(quizId, false)
      onRestored?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setRestoringQuizId(null)
    }
  }

  return (
    <section className="student-recent-results">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MY PERFORMANCE</span>
          <h2>Quiz history</h2>
          <p>
            Every completed quiz attempt appears here. Archiving only removes
            a quiz from Available while attempts remain.
          </p>
        </div>
        <button
          className="secondary"
          type="button"
          onClick={() => void loadResults()}
        >
          Refresh results
        </button>
      </div>

      {message && (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      )}
      {loading ? (
        <p>Loading quiz history...</p>
      ) : !resultsByQuiz.length ? (
        <div className="empty-state">
          <h3>No quizzes in history</h3>
          <p>
            Your quiz results will appear here after you complete an attempt.
          </p>
        </div>
      ) : (
        <div className="recent-result-groups">
          {resultsByQuiz.map((group) => (
            <article className="recent-result-group" key={group.quizId}>
              <header className="recent-result-group__heading">
                <div>
                  <span className="course-code">
                    {group.courseCode}
                    {group.moduleCode ? ` / ${group.moduleCode}` : ''}
                  </span>
                  <h3>{group.quizTitle}</h3>
                </div>

                <div className="recent-result-group__actions">
                  <div className="recent-result-group__summary">
                    <span className="status-chip">
                      {group.attempts.length}{' '}
                      {group.attempts.length === 1 ? 'result' : 'results'}
                    </span>
                    <span className="attempts-remaining">
                      {group.lifecycle?.attemptsRemaining ?? 0} attempts
                      remaining
                    </span>
                  </div>

                  {group.lifecycle?.archived &&
                    group.lifecycle?.attemptsRemaining > 0 &&
                    !group.lifecycle?.hasActiveAttempt && (
                      <button
                        className="secondary"
                        type="button"
                        disabled={restoringQuizId === group.quizId}
                        onClick={() => void handleRestore(group.quizId)}
                      >
                        {restoringQuizId === group.quizId
                          ? 'Restoring...'
                          : 'Restore to available'}
                      </button>
                    )}
                </div>
              </header>

              <div
                className="recent-attempt-table-wrapper"
                role="region"
                aria-label={`${group.quizTitle} attempt history`}
                tabIndex="0"
              >
                <table className="recent-attempt-table">
                  <thead>
                    <tr>
                      <th>Attempt</th>
                      <th>Score</th>
                      <th>Result</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.attempts.map((result, index) => (
                      <tr key={result.attemptId}>
                        <td data-label="Attempt">
                          <div className="recent-attempt-number">
                            <strong>Attempt #{result.attemptNumber}</strong>
                            {index === 0 && <span>Latest</span>}
                          </div>
                        </td>
                        <td data-label="Score">
                          <div className="recent-attempt-score">
                            <strong>
                              {Number(result.percentage).toFixed(2)}%
                            </strong>
                            <small>
                              {Number(result.scorePoints)} of{' '}
                              {Number(result.maximumPoints)} points
                            </small>
                          </div>
                        </td>
                        <td data-label="Result">
                          <span
                            className={
                              result.passed
                                ? 'quiz-result__status quiz-result__status--passed'
                                : 'quiz-result__status quiz-result__status--failed'
                            }
                          >
                            {result.passed ? 'Passed' : 'Not passed'}
                          </span>
                        </td>
                        <td data-label="Completed">
                          <time dateTime={result.submittedAt || result.startedAt}>
                            {formatDate(result.submittedAt || result.startedAt)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
