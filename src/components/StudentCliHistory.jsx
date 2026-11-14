import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, RotateCcw, SquareTerminal } from 'lucide-react'
import {
  getStudentCliArchiveStatuses,
  getStudentCliHistory,
  setStudentCliLabArchived,
} from '../services/cliLabService'
import AssessmentTypeIcon from './AssessmentTypeIcon'
import AppIcon from './AppIcon'
import DataLoadBoundary from './DataLoadBoundary'
import useStudentPageRefresh from '../hooks/useStudentPageRefresh'
import useDataLoadState from '../hooks/useDataLoadState'
import TailwindEmptyState from './TailwindEmptyState'
import { DataTableRegion } from './LayoutPrimitives'
import StudentAttemptReview from './StudentAttemptReview'
import useStudentAttemptReviewAccess from '../hooks/useStudentAttemptReviewAccess'

function formatDate(value) {
  if (!value) return 'Not submitted'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function StudentCliHistory({
  embedded = false,
  onRestored,
}) {
  const [attempts, setAttempts] = useState([])
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading, hasLoaded, markLoaded] = useDataLoadState()
  const [loadFailed, setLoadFailed] = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const [message, setMessage] = useState('')
  const [reviewAttempt, setReviewAttempt] = useState(null)
  const { canReview, refreshAccess, revoke, failed: reviewAccessFailed } = useStudentAttemptReviewAccess()

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      setMessage('')
      const [attemptData, statusData] = await Promise.all([
        getStudentCliHistory(),
        getStudentCliArchiveStatuses(),
      ])
      setAttempts(attemptData)
      setStatuses(statusData)
      markLoaded()
    } catch (error) {
      setLoadFailed(true)
      setMessage(
        `${error.message} Run migrations 022 and 051 if needed.`,
      )
    } finally {
      setLoading(false)
    }
  }, [markLoaded, setLoading])

  useEffect(() => { void loadHistory() }, [loadHistory])

  useStudentPageRefresh(loadHistory, { enabled: !loading && !restoringId })

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
    <section
      className={
        embedded
          ? 'student-recent-results student-cli-history student-recent-results--embedded'
          : 'student-recent-results student-cli-history'
      }
    >
      {embedded ? (
        <div className="student-history-section__heading">
          <AssessmentTypeIcon type="cli" />
          <div>
            <span className="eyebrow">CLI PRACTICAL RESULTS</span>
            <h2>Practical history</h2>
            <p>Scores, command totals, and outcomes from completed practicals.</p>
          </div>
        </div>
      ) : (
        <div className="section-heading">
          <div>
            <span className="eyebrow">CLI PRACTICAL HISTORY</span>
            <h2>Practical history</h2>
            <p>
              Every completed CLI attempt appears here. Archiving only removes
              a practical from Available while attempts remain.
            </p>
          </div>
        </div>
      )}

      {message && (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      )}

      {reviewAccessFailed && <p className="student-attempt-review-access">Attempt review access could not be checked. <button className="secondary" type="button" onClick={() => void refreshAccess()}>Check review access</button></p>}
      <DataLoadBoundary loading={loading} ready={hasLoaded} error={loadFailed} onRetry={loadHistory} label="Loading CLI history...">
        {!historyGroups.length ? (
          <TailwindEmptyState
            icon={SquareTerminal}
            title="No CLI practical history"
            description="Your CLI practical results will appear here after an attempt is completed."
          />
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
                        <button className="secondary button-with-icon" type="button"
                          disabled={restoringId === group.labId}
                          onClick={() => void restoreLab(group.labId)}>
                          <AppIcon icon={RotateCcw} size="sm" />
                          {restoringId === group.labId
                            ? 'Restoring...'
                            : 'Restore to available'}
                        </button>
                      )}
                    </div>
                  </header>

                  <DataTableRegion className="recent-attempt-table-wrapper" role="region"
                    aria-label={`${group.title} attempt history`}>
                    <table className="recent-attempt-table recent-attempt-table--cli recent-attempt-table--review">
                      <thead>
                        <tr>
                          <th>Attempt</th>
                          <th>Score</th>
                          <th>Result</th>
                          <th>Commands</th>
                          <th>Completed</th>
                        <th className="student-history-review-column">Review</th>
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
                          <td data-label="Review" className="student-history-review-cell">
                            <button className="secondary student-history-review-button" type="button"
                              aria-label={`Review attempt ${attempt.attemptNumber}`}
                              disabled={!canReview('cli', attempt.attemptId) || (attempt.status && !['submitted', 'expired'].includes(attempt.status))}
                              title={canReview('cli', attempt.attemptId) ? 'Review your submitted work and feedback' : 'Your instructor controls when review is available'}
                              onClick={() => setReviewAttempt(attempt)}><AppIcon icon={BookOpenCheck} size="sm" aria-hidden="true" /><span>Review</span></button>
                          </td>
                        </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataTableRegion>
                </article>
              )
            })}
          </div>
        )}
      </DataLoadBoundary>
      {reviewAttempt && <StudentAttemptReview
        key={reviewAttempt.attemptId}
        assessmentType="cli"
        attemptId={reviewAttempt.attemptId}
        title={reviewAttempt.title}
        authorized={canReview('cli', reviewAttempt.attemptId)}
        onClose={() => setReviewAttempt(null)}
        onUnavailable={revoke}
        onRefreshAccess={refreshAccess}
      />}
    </section>
  )
}
