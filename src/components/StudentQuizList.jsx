import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Play, RefreshCw } from 'lucide-react'
import AssessmentTypeIcon from './AssessmentTypeIcon'
import AppIcon from './AppIcon'
import {
  ResponsiveGrid,
  SectionHeader,
  SurfaceCard,
} from './LayoutPrimitives'
import WorkspaceLoading from './WorkspaceLoading'
import {
  getAvailableQuizzes,
  getStudentAttempts,
  getStudentQuizArchiveStatuses,
  setStudentQuizArchived,
  startQuizAttempt,
} from '../services/quizAttemptService'

function formatDate(value) {
  if (!value) return 'No deadline'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function StudentQuizList({ onOpenAttempt, onArchived }) {
  const [quizzes, setQuizzes] = useState([])
  const [attempts, setAttempts] = useState([])
  const [archiveStatuses, setArchiveStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [startingQuizId, setStartingQuizId] = useState(null)
  const [archivingQuizId, setArchivingQuizId] = useState(null)
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      const [quizData, attemptData, archiveData] = await Promise.all([
        getAvailableQuizzes(),
        getStudentAttempts(),
        getStudentQuizArchiveStatuses(),
      ])
      setQuizzes(quizData)
      setAttempts(attemptData)
      setArchiveStatuses(archiveData)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const attemptsByQuiz = useMemo(
    () =>
      attempts.reduce((grouped, attempt) => {
        grouped[attempt.quiz_id] ??= []
        grouped[attempt.quiz_id].push(attempt)
        return grouped
      }, {}),
    [attempts],
  )

  const archiveStatusByQuiz = useMemo(
    () =>
      Object.fromEntries(
        archiveStatuses.map((status) => [status.quizId, status]),
      ),
    [archiveStatuses],
  )

  const availableQuizzes = useMemo(
    () =>
      quizzes.filter((quiz) => {
        const lifecycle = archiveStatusByQuiz[quiz.id]
        if (!lifecycle) return true
        if (lifecycle.hasActiveAttempt) return true
        return !lifecycle.archived && lifecycle.attemptsRemaining > 0
      }),
    [archiveStatusByQuiz, quizzes],
  )

  async function handleStart(quizId) {
    try {
      setStartingQuizId(quizId)
      setMessage('')
      onOpenAttempt(await startQuizAttempt(quizId))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setStartingQuizId(null)
    }
  }

  async function handleArchive(quizId) {
    try {
      setArchivingQuizId(quizId)
      setMessage('')
      await setStudentQuizArchived(quizId, true)
      onArchived?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setArchivingQuizId(null)
    }
  }

  if (loading) {
    return <WorkspaceLoading label="Loading assessments..." />
  }

  return (
    <SurfaceCard className="student-quiz-list">
      <SectionHeader
        className="section-heading"
        eyebrow="STUDENT ASSESSMENTS"
        title="Available quizzes"
        description="Start or resume an assigned quiz. Completed quizzes stay here while attempts remain unless you archive them."
        actions={<button
          className="secondary"
          type="button"
          onClick={() => void loadData()}
        >
          <AppIcon icon={RefreshCw} size="sm" />
          Refresh
        </button>}
      />

      {message && (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      )}
      {!availableQuizzes.length ? (
        <div className="empty-state student-assessment-empty">
          <AssessmentTypeIcon type="quiz" />
          <h3>No quizzes available</h3>
          <p>
            You have no active assigned quizzes. Archived quizzes and quizzes
            with no attempts remaining are under Quiz history.
          </p>
        </div>
      ) : (
        <ResponsiveGrid className="quiz-card-grid">
          {availableQuizzes.map((quiz) => {
            const quizAttempts = attemptsByQuiz[quiz.id] ?? []
            const lifecycle = archiveStatusByQuiz[quiz.id]
            const activeAttempt = quizAttempts.find(
              (attempt) =>
                attempt.status === 'in_progress' &&
                new Date(attempt.expires_at).getTime() > Date.now(),
            )
            const attemptsRemaining = Math.max(
              0,
              lifecycle?.attemptsRemaining ??
                Number(quiz.max_attempts) - quizAttempts.length,
            )
            const canOpen = Boolean(activeAttempt) || attemptsRemaining > 0
            const hasCompletedAttempt = Boolean(
              lifecycle?.hasCompletedAttempt,
            )

            return (
              <SurfaceCard
                as="article"
                subtle
                className="student-quiz-card"
                key={quiz.id}
              >
                <header className="student-assessment-card__header">
                  <AssessmentTypeIcon type="quiz" />
                  <div className="student-assessment-card__identity">
                    <div className="student-assessment-card__kicker">
                      <span className="course-code">
                        {quiz.courses?.code ?? 'CCNA'}
                      </span>
                      <span className="student-assessment-card__module">
                        {quiz.modules?.code ?? 'General'}
                      </span>
                    </div>
                    <h3>{quiz.title}</h3>
                  </div>
                </header>
                {quiz.access_mode === 'assigned_classes' && (
                  <span className="assignment-badge">
                    Assigned to your class
                  </span>
                )}
                <p>{quiz.description || 'No description provided.'}</p>
                <dl className="student-quiz-card__details">
                  <div>
                    <dt>Duration</dt>
                    <dd>{quiz.duration_minutes} minutes</dd>
                  </div>
                  <div>
                    <dt>Passing score</dt>
                    <dd>{quiz.passing_score}%</dd>
                  </div>
                  <div>
                    <dt>Attempts used</dt>
                    <dd>
                      {lifecycle?.attemptsUsed ?? quizAttempts.length} of{' '}
                      {lifecycle?.maxAttempts ?? quiz.max_attempts}
                    </dd>
                  </div>
                  <div>
                    <dt>Available until</dt>
                    <dd>{formatDate(quiz.available_until)}</dd>
                  </div>
                </dl>

                <div className="student-quiz-card__actions">
                  <button
                    className="primary"
                    type="button"
                    disabled={!canOpen || startingQuizId === quiz.id}
                    onClick={() =>
                      activeAttempt
                        ? onOpenAttempt(activeAttempt.id)
                        : void handleStart(quiz.id)
                    }
                  >
                    <AppIcon icon={Play} size="sm" />
                    {startingQuizId === quiz.id
                      ? 'Starting...'
                      : activeAttempt
                        ? 'Resume quiz'
                        : canOpen
                          ? 'Start next attempt'
                          : 'No attempts remaining'}
                  </button>

                  {hasCompletedAttempt &&
                    !activeAttempt &&
                    attemptsRemaining > 0 && (
                      <button
                        className="secondary"
                        type="button"
                        disabled={archivingQuizId === quiz.id}
                        onClick={() => void handleArchive(quiz.id)}
                      >
                        <AppIcon icon={Archive} size="sm" />
                        {archivingQuizId === quiz.id
                          ? 'Archiving...'
                          : 'Archive to history'}
                      </button>
                    )}
                </div>
              </SurfaceCard>
            )
          })}
        </ResponsiveGrid>
      )}
    </SurfaceCard>
  )
}
