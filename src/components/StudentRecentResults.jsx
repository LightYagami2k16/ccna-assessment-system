import { useCallback, useEffect, useState } from 'react'
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
      setResults(await getStudentRecentResults(10))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadResults()
  }, [loadResults])

  return (
    <section className="student-recent-results">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MY PERFORMANCE</span>
          <h2>Recent quiz results</h2>
          <p>Your 10 most recent completed quiz attempts and scores.</p>
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
        <div className="recent-result-grid">
          {results.map((result) => (
            <article className="recent-result-card" key={result.attemptId}>
              <header>
                <div>
                  <span className="course-code">
                    {result.courseCode}
                    {result.moduleCode ? ` / ${result.moduleCode}` : ''}
                  </span>
                  <h3>{result.quizTitle}</h3>
                </div>
                <span
                  className={
                    result.passed
                      ? 'quiz-result__status quiz-result__status--passed'
                      : 'quiz-result__status quiz-result__status--failed'
                  }
                >
                  {result.passed ? 'Passed' : 'Not passed'}
                </span>
              </header>

              <div className="recent-result-card__score">
                <strong>{Number(result.percentage).toFixed(2)}%</strong>
                <span>
                  {Number(result.scorePoints)} of {Number(result.maximumPoints)} points
                </span>
              </div>

              <dl>
                <div>
                  <dt>Attempt</dt>
                  <dd>#{result.attemptNumber}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>{formatDate(result.submittedAt || result.startedAt)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
