import { useState } from 'react'
import {
  deleteInstructorQuiz,
  setInstructorQuizStatus,
} from '../services/quizBuilderService'

function formatDate(value) {
  if (!value) return 'No limit'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function InstructorQuizList({ quizzes, onEdit, onChanged }) {
  const [deletingId, setDeletingId] = useState(null)
  const [statusChangingId, setStatusChangingId] = useState(null)
  const [message, setMessage] = useState('')

  async function handleDelete(quiz) {
    if (!window.confirm(`Delete the unused draft quiz "${quiz.title}"?`)) return

    setDeletingId(quiz.id)
    setMessage('')
    try {
      await deleteInstructorQuiz(quiz.id)
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleStatusChange(quiz) {
    const nextStatus = quiz.status === 'published' ? 'draft' : 'published'
    const verb = nextStatus === 'published' ? 'Publish' : 'Unpublish'
    if (!window.confirm(`${verb} "${quiz.title}"?`)) return

    setStatusChangingId(quiz.id)
    setMessage('')
    try {
      await setInstructorQuizStatus(quiz.id, nextStatus)
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setStatusChangingId(null)
    }
  }

  return (
    <section className="instructor-quiz-list">
      {message && <p className="form-message form-message--error">{message}</p>}
      {!quizzes.length ? (
        <div className="empty-state">
          <h3>No quizzes created yet</h3>
          <p>Use Create Quiz to assemble your first assessment.</p>
        </div>
      ) : (
        <div className="instructor-quiz-grid">
          {quizzes.map((quiz) => (
            <article className="instructor-quiz-card" key={quiz.id}>
              <div className="instructor-quiz-card__heading">
                <div>
                  <span className="course-code">{quiz.courses?.code ?? 'CCNA'}</span>
                  <h3>{quiz.title}</h3>
                </div>
                <span className={`content-status content-status--${quiz.status}`}>
                  {quiz.status}
                </span>
              </div>
              <p>{quiz.description || 'No description provided.'}</p>
              <dl>
                <div>
                  <dt>Questions</dt>
                  <dd>{quiz.quiz_questions?.length ?? 0}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{quiz.duration_minutes} minutes</dd>
                </div>
                <div>
                  <dt>Attempts</dt>
                  <dd>{quiz.max_attempts}</dd>
                </div>
                <div>
                  <dt>Passing score</dt>
                  <dd>{quiz.passing_score}%</dd>
                </div>
                <div>
                  <dt>Opens</dt>
                  <dd>{formatDate(quiz.available_from)}</dd>
                </div>
                <div>
                  <dt>Closes</dt>
                  <dd>{formatDate(quiz.available_until)}</dd>
                </div>
              </dl>
              <div className="instructor-quiz-card__actions">
                <button className="primary" type="button" onClick={() => onEdit(quiz)}>
                  Edit quiz
                </button>
                <button
                  className={`status-toggle-button ${
                    quiz.status === 'published' ? 'secondary' : 'primary'
                  }`}
                  type="button"
                  disabled={statusChangingId === quiz.id}
                  onClick={() => void handleStatusChange(quiz)}
                >
                  {statusChangingId === quiz.id
                    ? 'Updating...'
                    : quiz.status === 'published'
                      ? 'Unpublish'
                      : 'Publish'}
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={quiz.status !== 'draft' || deletingId === quiz.id}
                  onClick={() => void handleDelete(quiz)}
                >
                  {deletingId === quiz.id ? 'Deleting...' : 'Delete draft'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
