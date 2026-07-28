import { useEffect, useState } from 'react'
import { getStudentCliHistory } from '../services/cliLabService'

function formatDate(value) {
  if (!value) return 'Not submitted'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function StudentCliHistory() {
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getStudentCliHistory()
        if (active) setAttempts(data)
      } catch (error) {
        if (active) {
          setMessage(
            `${error.message} Run migration 022_cli_history_and_results.sql if needed.`,
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  return (
    <section className="student-recent-results student-cli-history">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CLI PRACTICAL HISTORY</span>
          <h2>Recent practical results</h2>
          <p>Completed and expired Cisco CLI practical attempts.</p>
        </div>
        <span className="status-chip">{attempts.length} attempts</span>
      </div>

      {loading ? <p>Loading CLI history...</p> : !attempts.length ? (
        <div className="empty-state">
          <h3>No CLI practical history</h3>
          <p>Submitted CLI practicals will appear here.</p>
        </div>
      ) : (
        <div
          className="cli-history-table-wrapper"
          role="region"
          aria-label="CLI practical attempt history"
          tabIndex="0"
        >
          <table className="cli-history-table">
            <thead>
              <tr>
                <th>Practical</th>
                <th>Attempt</th>
                <th>Raw score</th>
                <th>Result</th>
                <th>Commands</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.attemptId}>
                  <td data-label="Practical">
                    <strong>{attempt.title}</strong>
                    <small>
                      {attempt.courseCode}
                      {attempt.moduleCode ? ` · ${attempt.moduleCode}` : ''}
                      {' · '}{attempt.deviceType}
                    </small>
                  </td>
                  <td data-label="Attempt">#{attempt.attemptNumber}</td>
                  <td data-label="Raw score">
                    <strong>
                      {Number(attempt.scorePoints)} /{' '}
                      {Number(attempt.maximumPoints)}
                    </strong>
                    <small>({Number(attempt.percentage).toFixed(2)}%)</small>
                  </td>
                  <td data-label="Result">
                    <span className={[
                      'result-status',
                      attempt.passed
                        ? 'result-status--passed'
                        : 'result-status--failed',
                    ].join(' ')}>
                      {attempt.status === 'expired'
                        ? 'Expired'
                        : attempt.passed ? 'Passed' : 'Failed'}
                    </span>
                  </td>
                  <td data-label="Commands">{attempt.commandCount}</td>
                  <td data-label="Submitted">{formatDate(attempt.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {message && (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      )}
    </section>
  )
}
