import { useCallback, useEffect, useMemo, useState } from 'react'
import { getStudentRecentResults } from '../services/quizAttemptService'

function formatDate(value) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function StudentRecentResults() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const loadResults = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      setResults(await getStudentRecentResults(50))
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

    return Array.from(groups.values())
  }, [results])

  return (
    <section className="student-recent-results">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MY PERFORMANCE</span>
          <h2>Recent quiz results</h2>
          <p>
            Completed attempts are grouped by quiz, with the newest attempt
            shown first.
          </p>
        </div>
        <button className="secondary" type="button" onClick={() => void loadResults()}>
          Refresh results
        </button>
      </div>

      {message && <p className="form-message form-message--error">{message}</p>}
      {loading ? (
        <p>Loading recent results...</p>
      ) : !results.length ? (
        <div className="empty-state">
          <h3>No completed quizzes yet</h3>
          <p>Your results will appear here after you submit a quiz.</p>
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
                <span className="status-chip">
                  {group.attempts.length}{' '}
                  {group.attempts.length === 1 ? 'attempt' : 'attempts'}
                </span>
              </header>

              <div className="recent-attempt-table-wrapper">
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
                        <td>
                          <div className="recent-attempt-number">
                            <strong>Attempt #{result.attemptNumber}</strong>
                            {index === 0 && <span>Latest</span>}
                          </div>
                        </td>
                        <td>
                          <div className="recent-attempt-score">
                            <strong>{Number(result.percentage).toFixed(2)}%</strong>
                            <small>
                              {Number(result.scorePoints)} of{' '}
                              {Number(result.maximumPoints)} points
                            </small>
                          </div>
                        </td>
                        <td>
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
                        <td>
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
