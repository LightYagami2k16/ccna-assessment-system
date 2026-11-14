import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, History, RotateCcw } from 'lucide-react'
import {
  getStudentQuizArchiveStatuses,
  getStudentRecentResults,
  setStudentQuizArchived,
} from '../services/quizAttemptService'
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
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function StudentRecentResults({
  embedded = false,
  onRestored,
}) {
  const [results, setResults] = useState([])
  const [archiveStatuses, setArchiveStatuses] = useState([])
  const [loading, setLoading, hasLoaded, markLoaded] = useDataLoadState()
  const [loadFailed, setLoadFailed] = useState(false)
  const [restoringQuizId, setRestoringQuizId] = useState(null)
  const [message, setMessage] = useState('')
  const [reviewAttempt, setReviewAttempt] = useState(null)
  const { canReview, refreshAccess, revoke, failed: reviewAccessFailed } = useStudentAttemptReviewAccess()

  const loadResults = useCallback(async () => {
    setLoadFailed(false)
    try {
      setLoading(true)
      setMessage('')
      const [resultData, archiveData] = await Promise.all([
        getStudentRecentResults(50),
        getStudentQuizArchiveStatuses(),
      ])
      setResults(resultData)
      setArchiveStatuses(archiveData)
      markLoaded()
    } catch (error) {
      setLoadFailed(true)
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [markLoaded, setLoading])

  useEffect(() => {
    void loadResults()
  }, [loadResults])

  useStudentPageRefresh(loadResults, { enabled: !loading && !restoringQuizId })

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
    <section
      className={
        embedded
          ? 'student-recent-results student-recent-results--embedded'
          : 'student-recent-results'
      }
    >
      {embedded ? (
        <div className="student-history-section__heading">
          <AssessmentTypeIcon type="quiz" />
          <div>
            <span className="eyebrow">QUIZ RESULTS</span>
            <h2>Quiz history</h2>
            <p>Scores and outcomes from every completed quiz attempt.</p>
          </div>
        </div>
      ) : (
        <div className="section-heading">
          <div>
            <span className="eyebrow">MY PERFORMANCE</span>
            <h2>Quiz history</h2>
            <p>
              Every completed quiz attempt appears here. Archiving only removes
              a quiz from Available while attempts remain.
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
      <DataLoadBoundary loading={loading} ready={hasLoaded} error={loadFailed} onRetry={loadResults} label="Loading quiz history...">
        {!resultsByQuiz.length ? (
          <TailwindEmptyState
            icon={History}
            title="No quizzes in history"
            description="Your quiz results will appear here after you complete an attempt."
          />
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
                          className="secondary button-with-icon"
                          type="button"
                          disabled={restoringQuizId === group.quizId}
                          onClick={() => void handleRestore(group.quizId)}
                        >
                          <AppIcon icon={RotateCcw} size="sm" />
                          {restoringQuizId === group.quizId
                            ? 'Restoring...'
                            : 'Restore to available'}
                        </button>
                      )}
                  </div>
                </header>

                <DataTableRegion
                  className="recent-attempt-table-wrapper"
                  role="region"
                  aria-label={`${group.quizTitle} attempt history`}
                >
                  <table className="recent-attempt-table recent-attempt-table--review">
                    <thead>
                      <tr>
                        <th>Attempt</th>
                        <th>Score</th>
                        <th>Result</th>
                        <th>Completed</th>
                        <th className="student-history-review-column">Review</th>
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
                          <td data-label="Review" className="student-history-review-cell">
                            <button className="secondary student-history-review-button" type="button"
                              aria-label={`Review attempt ${result.attemptNumber}`}
                              disabled={!canReview('quiz', result.attemptId) || (result.status && !['submitted', 'expired'].includes(result.status))}
                              title={canReview('quiz', result.attemptId) ? 'Review your submitted work and feedback' : 'Your instructor controls when review is available'}
                              onClick={() => setReviewAttempt(result)}><AppIcon icon={BookOpenCheck} size="sm" aria-hidden="true" /><span>Review</span></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTableRegion>
              </article>
            ))}
          </div>
        )}
      </DataLoadBoundary>
      {reviewAttempt && <StudentAttemptReview
        key={reviewAttempt.attemptId}
        assessmentType="quiz"
        attemptId={reviewAttempt.attemptId}
        title={reviewAttempt.quizTitle}
        authorized={canReview('quiz', reviewAttempt.attemptId)}
        onClose={() => setReviewAttempt(null)}
        onUnavailable={revoke}
        onRefreshAccess={refreshAccess}
      />}
    </section>
  )
}
