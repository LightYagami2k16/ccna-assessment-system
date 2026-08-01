import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getStudentCliArchiveStatuses,
  getStudentCliHistory,
  setStudentCliLabArchived,
} from '../services/cliLabService'

function formatDate(value) {
  if (!value) return 'Not submitted'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function StudentCliHistory({ onRestored }) {
  const [attempts, setAttempts] = useState([])
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState(null)
  const [message, setMessage] = useState('')

  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      setMessage('')
      const [attemptData, statusData] = await Promise.all([
        getStudentCliHistory(),
        getStudentCliArchiveStatuses(),
      ])
      setAttempts(attemptData)
      setStatuses(statusData)
    } catch (error) {
      setMessage(
        `${error.message} Run migrations 022 and 051 if needed.`,
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadHistory() }, [loadHistory])

  const statusByLab = useMemo(
    () => new Map(statuses.map((item) => [String(item.labId), item])),
    [statuses],
  )

  const historyGroups = useMemo(() => {
    const groups = new Map()
    attempts.forEach((attempt) => {
      const labId = String(attempt.labId)
      if (!groups.has(labId)) {
        groups.set(labId, {
          labId,
          title: attempt.title,
          courseCode: attempt.courseCode,
          moduleCode: attempt.moduleCode,
          status: statusByLab.get(labId),
          attempts: [],
        })
      }
      groups.get(labId).attempts.push(attempt)
    })
    return [...groups.values()]
  }, [attempts, statusByLab])

  async function restoreLab(labId) {
    setRestoringId(labId)
    try {
      setMessage('')
      await setStudentCliLabArchived(labId, false)
      await loadHistory()
      onRestored?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <section className="student-recent-results student-cli-history">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CLI PRACTICAL HISTORY</span>
          <h2>Practical history</h2>
          <p>
            Every completed CLI attempt appears here. Archiving only removes
            a practical from Available while attempts remain.
          </p>
        </div>
        <button className="secondary" type="button"
          onClick={() => void loadHistory()}>
          Refresh results
        </button>
      </div>

      {message && (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      )}

      {loading ? <p>Loading CLI history...</p> : !historyGroups.length ? (
        <div className="empty-state">
          <h3>No CLI practical history</h3>
          <p>Your CLI practical results will appear here after an attempt is completed.</p>
        </div>
      ) : (
        <div className="recent-result-groups">
          {historyGroups.map((group) => {
            const canRestore = Boolean(group.status?.archived)
              && Number(group.status?.attemptsRemaining) > 0
              && !group.status?.activeAttemptId

            return (
              <article className="recent-result-group" key={group.labId}>
                <header className="recent-result-group__heading">
                  <div>
                    <span className="course-code">
                      {group.courseCode}
                      {group.moduleCode ? ` / ${group.moduleCode}` : ''}
                    </span>
                    <h3>{group.title}</h3>
                  </div>

                  <div className="recent-result-group__actions">
                    <div className="recent-result-group__summary">
                      <span className="status-chip">
                        {group.attempts.length}{' '}
                        {group.attempts.length === 1 ? 'result' : 'results'}
                      </span>
                      <span className="attempts-remaining">
                        {Number(group.status?.attemptsRemaining ?? 0)} attempts remaining
                      </span>
                    </div>

                    {canRestore && (
                      <button className="secondary" type="button"
                        disabled={restoringId === group.labId}
                        onClick={() => void restoreLab(group.labId)}>
                        {restoringId === group.labId
                          ? 'Restoring...'
                          : 'Restore to available'}
                      </button>
                    )}
                  </div>
                </header>

                <div className="recent-attempt-table-wrapper" role="region"
                  aria-label={`${group.title} attempt history`} tabIndex="0">
                  <table className="recent-attempt-table recent-attempt-table--cli">
                    <thead>
                      <tr>
                        <th>Attempt</th>
                        <th>Score</th>
                        <th>Result</th>
                        <th>Commands</th>
                        <th>Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.attempts.map((attempt, index) => (
                        <tr key={attempt.attemptId}>
                          <td data-label="Attempt">
                            <div className="recent-attempt-number">
                              <strong>Attempt #{attempt.attemptNumber}</strong>
                              {index === 0 && <span>Latest</span>}
                            </div>
                          </td>
                          <td data-label="Score">
                            <div className="recent-attempt-score">
                              <strong>{Number(attempt.percentage).toFixed(2)}%</strong>
                              <small>
                                {Number(attempt.scorePoints)} of{' '}
                                {Number(attempt.maximumPoints)} points
                              </small>
                            </div>
                          </td>
                          <td data-label="Result">
                            <span className={
                              attempt.passed
                                ? 'quiz-result__status quiz-result__status--passed'
                                : 'quiz-result__status quiz-result__status--failed'
                            }>
                              {attempt.status === 'expired'
                                ? 'Expired'
                                : attempt.passed ? 'Passed' : 'Not passed'}
                            </span>
                          </td>
                          <td data-label="Commands">
                            <strong>{Number(attempt.commandCount ?? 0)}</strong>
                          </td>
                          <td data-label="Completed">
                            <time dateTime={attempt.submittedAt || attempt.startedAt}>
                              {formatDate(attempt.submittedAt || attempt.startedAt)}
                            </time>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
