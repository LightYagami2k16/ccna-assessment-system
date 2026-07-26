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
  const [expandedCourseIds, setExpandedCourseIds] = useState([])

  const quizIds = useMemo(
    () => quizzes.map((quiz) => quiz.id),
    [quizzes],
  )

  const courseGroups = useMemo(() => {
    const groups = new Map()

    for (const quiz of quizzes) {
      const courseId = String(
        quiz.course_id ?? quiz.courses?.id ?? 'uncategorized',
      )

      if (!groups.has(courseId)) {
        groups.set(courseId, {
          id: courseId,
          code: quiz.courses?.code ?? 'OTHER',
          title: quiz.courses?.title ?? 'Uncategorized',
          quizzes: [],
        })
      }

      groups.get(courseId).quizzes.push(quiz)
    }

    const courseOrder = {
      ITN: 1,
      SRWE: 2,
      ENSA: 3,
    }

    return [...groups.values()].sort(
      (left, right) =>
        (courseOrder[left.code] ?? 999) -
          (courseOrder[right.code] ?? 999) ||
        left.code.localeCompare(right.code, undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
    )
  }, [quizzes])

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

  useEffect(() => {
    const courseIds = courseGroups.map((course) => course.id)

    setExpandedCourseIds((current) =>
      current.filter((id) => courseIds.includes(id)),
    )
  }, [courseGroups])

  function toggleCourseGroup(courseId) {
    setExpandedCourseIds((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId],
    )
  }

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
        <div className="quiz-course-groups">
          {courseGroups.map((course) => {
            const expanded = expandedCourseIds.includes(course.id)
            const panelId = `quiz-course-panel-${course.id}`
            const courseQuizIds = course.quizzes.map(
              (quiz) => quiz.id,
            )
            const allCourseQuizzesSelected =
              courseQuizIds.length > 0 &&
              courseQuizIds.every((id) =>
                selectedIds.includes(id),
              )

            return (
              <section className="quiz-course-group" key={course.id}>
                <header className="quiz-course-group__header">
                  <div className="quiz-course-group__summary">
                    <div className="quiz-course-group__identity">
                      <span className="course-code">{course.code}</span>

                      <div>
                        <h3>{course.title}</h3>
                        <small>
                          {course.quizzes.length}{' '}
                          {course.quizzes.length === 1
                            ? 'quiz'
                            : 'quizzes'}
                        </small>
                      </div>
                    </div>

                    <label className="bulk-select-control">
                      <input
                        type="checkbox"
                        checked={allCourseQuizzesSelected}
                        disabled={
                          !courseQuizIds.length ||
                          bulkAction !== null
                        }
                        onChange={(event) =>
                          toggleSelection(
                            courseQuizIds,
                            event.target.checked,
                          )
                        }
                      />
                      Select all in {course.code}
                    </label>
                  </div>

                  <button
                    className="module-collapse-button"
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggleCourseGroup(course.id)}
                  >
                    {expanded ? 'Hide quizzes' : 'Show quizzes'}
                  </button>
                </header>

                {expanded && (
                  <div
                    className="instructor-quiz-grid"
                    id={panelId}
                  >
                    {course.quizzes.map((quiz) => (
                      <article
                        className="instructor-quiz-card"
                        key={quiz.id}
                      >
                        <div className="instructor-quiz-card__heading">
                          <div>
                            <span className="course-code">
                              {quiz.courses?.code ?? 'CCNA'}
                            </span>
                            <h3>{quiz.title}</h3>
                          </div>
                          <span
                            className={`content-status content-status--${quiz.status}`}
                          >
                            {quiz.status}
                          </span>
                        </div>
                        <p>
                          {quiz.description ||
                            'No description provided.'}
                        </p>
                        <dl>
                          <div>
                            <dt>Questions</dt>
                            <dd>
                              {quiz.question_selection_mode ===
                              'random_database'
                                ? `${quiz.random_question_count} random`
                                : quiz.quiz_questions?.length ?? 0}
                            </dd>
                          </div>
                          <div>
                            <dt>Duration</dt>
                            <dd>
                              {quiz.duration_minutes} minutes
                            </dd>
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
                            <dd>
                              {formatDate(quiz.available_from)}
                            </dd>
                          </div>
                          <div>
                            <dt>Closes</dt>
                            <dd>
                              {formatDate(quiz.available_until)}
                            </dd>
                          </div>
                        </dl>
                        <div className="instructor-quiz-card__actions">
                          <button
                            className="primary"
                            type="button"
                            onClick={() => onEdit(quiz)}
                          >
                            Edit quiz
                          </button>
                          <button
                            className={`status-toggle-button ${
                              quiz.status === 'published'
                                ? 'secondary'
                                : 'primary'
                            }`}
                            type="button"
                            disabled={
                              statusChangingId === quiz.id
                            }
                            onClick={() =>
                              void handleStatusChange(quiz)
                            }
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
                            disabled={
                              quiz.status !== 'draft' ||
                              deletingId === quiz.id
                            }
                            onClick={() =>
                              void handleDelete(quiz)
                            }
                          >
                            {deletingId === quiz.id
                              ? 'Deleting...'
                              : 'Delete draft'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
