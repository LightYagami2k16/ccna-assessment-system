import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getAvailableQuizzes,
  getStudentAttempts,
  startQuizAttempt,
} from '../services/quizAttemptService'

function formatDate(value) {
  if (!value) return 'No deadline'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function StudentQuizList({ onOpenAttempt }) {
  const [quizzes, setQuizzes] = useState([])
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [startingQuizId, setStartingQuizId] = useState(null)
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      const [quizData, attemptData] = await Promise.all([
        getAvailableQuizzes(),
        getStudentAttempts(),
      ])
      setQuizzes(quizData)
      setAttempts(attemptData)
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

  if (loading) {
    return <section className="student-quiz-list">Loading available quizzes…</section>
  }

  return (
    <section className="student-quiz-list">
      <div className="section-heading">
        <div>
          <span className="eyebrow">STUDENT ASSESSMENTS</span>
          <h2>Available quizzes</h2>
          <p>Select a published assessment to begin or resume an attempt.</p>
        </div>
        <button className="secondary" type="button" onClick={() => void loadData()}>
          Refresh
        </button>
      </div>

      {message && <p className="form-message form-message--error">{message}</p>}
      {!quizzes.length ? (
        <div className="empty-state">
          <h3>No quizzes available</h3>
          <p>Your instructor has not published an available quiz yet.</p>
        </div>
      ) : (
        <div className="quiz-card-grid">
          {quizzes.map((quiz) => {
            const quizAttempts = attemptsByQuiz[quiz.id] ?? []
            const activeAttempt = quizAttempts.find(
              (attempt) =>
                attempt.status === 'in_progress' &&
                new Date(attempt.expires_at).getTime() > Date.now(),
            )
            const latestCompleted = quizAttempts.find(
              (attempt) => attempt.status !== 'in_progress',
            )
            const attemptsRemaining = Math.max(
              0,
              Number(quiz.max_attempts) - quizAttempts.length,
            )
            const canOpen = Boolean(activeAttempt) || attemptsRemaining > 0

            return (
              <article className="student-quiz-card" key={quiz.id}>
                <div className="student-quiz-card__course">
                  <span>{quiz.courses?.code ?? 'CCNA'}</span>
                  <span>{quiz.modules?.code ?? 'General'}</span>
                </div>
                <h3>{quiz.title}</h3>
                {quiz.access_mode === 'assigned_classes' && (
                  <span className="assignment-badge">Assigned to your class</span>
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
                      {quizAttempts.length} of {quiz.max_attempts}
                    </dd>
                  </div>
                  <div>
                    <dt>Available until</dt>
                    <dd>{formatDate(quiz.available_until)}</dd>
                  </div>
                </dl>
                {latestCompleted && (
                  <div className="student-quiz-card__history">
                    <strong>Latest result</strong>
                    <span>{latestCompleted.percentage}%</span>
                  </div>
                )}
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
                  {startingQuizId === quiz.id
                    ? 'Starting…'
                    : activeAttempt
                      ? 'Resume quiz'
                      : canOpen
                        ? 'Start quiz'
                        : 'No attempts remaining'}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
