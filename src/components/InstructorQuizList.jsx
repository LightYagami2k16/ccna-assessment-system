import { useEffect, useMemo, useState } from 'react'
import {
  deleteInstructorQuiz,
  deleteInstructorQuizzes,
  setInstructorQuizStatus,
  setInstructorQuizzesStatus,
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
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkAction, setBulkAction] = useState(null)

  const quizIds = useMemo(
    () => quizzes.map((quiz) => quiz.id),
    [quizzes],
  )

  const selectedQuizzes = useMemo(
    () =>
      quizzes.filter((quiz) => selectedIds.includes(quiz.id)),
    [quizzes, selectedIds],
  )

  const selectionCanBeDeleted =
    selectedQuizzes.length > 0 &&
    selectedQuizzes.every((quiz) => quiz.status === 'draft')

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => quizIds.includes(id)),
    )
  }, [quizIds])

  function toggleSelection(ids, checked) {
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, ...ids])]
        : current.filter((id) => !ids.includes(id)),
    )
  }

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

  async function handleBulkDelete() {
    if (!selectedIds.length) return

    if (
      !window.confirm(
        `Delete ${selectedIds.length} selected draft ${
          selectedIds.length === 1 ? 'quiz' : 'quizzes'
        }?\n\nA quiz with student attempts cannot be deleted. This cannot be undone.`,
      )
    ) {
      return
    }

    setBulkAction('delete')
    setMessage('')
    try {
      await deleteInstructorQuizzes(selectedIds)
      setSelectedIds([])
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBulkAction(null)
    }
  }

  async function handleBulkStatus(status) {
    if (!selectedIds.length) return

    const verb = status === 'published' ? 'Publish' : 'Unpublish'
    if (
      !window.confirm(
        `${verb} ${selectedIds.length} selected ${
          selectedIds.length === 1 ? 'quiz' : 'quizzes'
        }?`,
      )
    ) {
      return
    }

    setBulkAction(status)
    setMessage('')
    try {
      await setInstructorQuizzesStatus(selectedIds, status)
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBulkAction(null)
    }
  }

  return (
    <section className="instructor-quiz-list">
      {message && <p className="form-message form-message--error">{message}</p>}
      {!!quizzes.length && (
        <div className="bulk-action-bar">
          <label className="bulk-select-control">
            <input
              type="checkbox"
              checked={
                quizIds.length > 0 &&
                quizIds.every((id) => selectedIds.includes(id))
              }
              disabled={!quizIds.length || bulkAction !== null}
              onChange={(event) =>
                toggleSelection(quizIds, event.target.checked)
              }
            />
            Select all quizzes
          </label>

          <div className="bulk-action-bar__actions">
            <span>{selectedIds.length} selected</span>
            <button
              className="primary bulk-action-button"
              type="button"
              disabled={!selectedIds.length || bulkAction !== null}
              onClick={() => void handleBulkStatus('published')}
            >
              {bulkAction === 'published'
                ? 'Publishing...'
                : 'Publish selected'}
            </button>
            <button
              className="secondary bulk-action-button"
              type="button"
              disabled={!selectedIds.length || bulkAction !== null}
              onClick={() => void handleBulkStatus('draft')}
            >
              {bulkAction === 'draft'
                ? 'Unpublishing...'
                : 'Unpublish selected'}
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={
                !selectionCanBeDeleted || bulkAction !== null
              }
              title={
                selectionCanBeDeleted
                  ? 'Delete the selected draft quizzes'
                  : 'Only draft quizzes can be deleted'
              }
              onClick={() => void handleBulkDelete()}
            >
              {bulkAction === 'delete'
                ? 'Deleting...'
                : 'Delete selected'}
            </button>
          </div>
        </div>
      )}

      {!quizzes.length ? (
        <div className="empty-state">
          <h3>No quizzes created yet</h3>
          <p>Use Create Quiz to assemble your first assessment.</p>
        </div>
      ) : (
        <div className="instructor-quiz-grid">
          {quizzes.map((quiz) => (
            <article className="instructor-quiz-card" key={quiz.id}>
              <label className="card-select-control">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(quiz.id)}
                  disabled={bulkAction !== null}
                  onChange={(event) =>
                    toggleSelection([quiz.id], event.target.checked)
                  }
                />
                Select for bulk action
              </label>
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
                  <dd>
                    {quiz.question_selection_mode === 'random_database'
                      ? `${quiz.random_question_count} random`
                      : quiz.quiz_questions?.length ?? 0}
                  </dd>
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
