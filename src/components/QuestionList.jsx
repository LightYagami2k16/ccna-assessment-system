import { useEffect, useMemo, useState } from 'react'
import {
  deleteQuestion,
  deleteQuestions,
  setQuestionStatus,
  setQuestionsStatus,
} from '../services/questionService'
import useConfirmationDialog from '../hooks/useConfirmationDialog'

export default function QuestionList({ questions, onEdit, onChanged }) {
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkAction, setBulkAction] = useState(null)
  const [rowActions, setRowActions] = useState({})
  const [expandedCourseIds, setExpandedCourseIds] = useState([])
  const { confirm, confirmationDialog } = useConfirmationDialog()

  const questionIds = useMemo(
    () => questions.map((question) => question.id),
    [questions],
  )

  const courseGroups = useMemo(() => {
    const groups = new Map()

    for (const question of questions) {
      const courseId = String(
        question.course_id ?? question.courses?.id ?? 'uncategorized',
      )

      if (!groups.has(courseId)) {
        groups.set(courseId, {
          id: courseId,
          code: question.courses?.code ?? 'OTHER',
          title: question.courses?.title ?? 'Uncategorized',
          questions: [],
        })
      }

      groups.get(courseId).questions.push(question)
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
  }, [questions])

  const selectedQuestions = useMemo(
    () =>
      questions.filter((question) =>
        selectedIds.includes(question.id),
      ),
    [questions, selectedIds],
  )

  const selectionCanBeDeleted =
    selectedQuestions.length > 0 &&
    selectedQuestions.every(
      (question) => question.status === 'draft',
    )

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((id) => questionIds.includes(id)),
    )
  }, [questionIds])

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

  async function handleDelete(question) {
    const confirmed = await confirm({
      title: 'Delete draft question?',
      message: `Delete “${question.title}”? Questions with student attempt history cannot be deleted. This action cannot be undone.`,
      confirmLabel: 'Delete question',
      tone: 'danger',
    })
    if (!confirmed) return

    setBusyId(question.id)
    setMessage('')
    try {
      await deleteQuestion(question.id)
      await onChanged?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleStatusChange(question) {
    const nextStatus = question.status === 'published' ? 'draft' : 'published'
    const verb = nextStatus === 'published' ? 'Publish' : 'Unpublish'
    const confirmed = await confirm({
      title: `${verb} question?`,
      message: `${verb} “${question.title}”?`,
      confirmLabel: verb,
      tone: 'default',
    })
    if (!confirmed) return

    setBusyId(question.id)
    setMessage('')
    try {
      await setQuestionStatus(question.id, nextStatus)
      await onChanged?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleBulkDelete() {
    if (!selectedIds.length) return

    const confirmed = await confirm({
      title: `Delete ${selectedIds.length} selected ${
        selectedIds.length === 1 ? 'question' : 'questions'
      }?`,
      message:
        'Questions with student attempt history cannot be deleted. This action cannot be undone.',
      confirmLabel: 'Delete selected',
      tone: 'danger',
    })
    if (!confirmed) return

    setBulkAction('delete')
    setMessage('')
    try {
      await deleteQuestions(selectedIds)
      setSelectedIds([])
      await onChanged?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBulkAction(null)
    }
  }

  async function handleBulkStatus(status) {
    if (!selectedIds.length) return

    const verb = status === 'published' ? 'Publish' : 'Unpublish'
    const confirmed = await confirm({
      title: `${verb} selected questions?`,
      message: `${verb} ${selectedIds.length} selected ${
        selectedIds.length === 1 ? 'question' : 'questions'
      }?`,
      confirmLabel: `${verb} selected`,
      tone: 'default',
    })
    if (!confirmed) return

    setBulkAction(status)
    setMessage('')
    try {
      await setQuestionsStatus(selectedIds, status)
      await onChanged?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBulkAction(null)
    }
  }

  async function handleRowAction(question) {
    const action = rowActions[question.id]
    if (!action) return

    if (action === 'edit') {
      onEdit(question)
      return
    }

    if (action === 'delete') {
      await handleDelete(question)
    } else {
      await handleStatusChange(question)
    }

    setRowActions((current) => ({
      ...current,
      [question.id]: '',
    }))
  }

  return (
    <section className="question-list">
      {confirmationDialog}
      <div className="section-heading">
        <div>
          <span className="eyebrow">CONTENT LIBRARY</span>
          <h2>Question bank</h2>
        </div>
        <span className="status-chip">
          {questions.length} {questions.length === 1 ? 'question' : 'questions'}
        </span>
      </div>

      {message && <p className="form-message form-message--error">{message}</p>}
      {!!questions.length && (
        <div className="bulk-action-bar">
          <label className="bulk-select-control">
            <input
              type="checkbox"
              checked={
                questionIds.length > 0 &&
                questionIds.every((id) => selectedIds.includes(id))
              }
              disabled={!questionIds.length || bulkAction !== null}
              onChange={(event) =>
                toggleSelection(questionIds, event.target.checked)
              }
            />
            Select all questions
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
                  ? 'Delete the selected draft questions'
                  : 'Only draft questions can be deleted'
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

      {!questions.length ? (
        <div className="empty-state">
          <h3>No questions created yet</h3>
          <p>Your first saved question will appear here.</p>
        </div>
      ) : (
        <div className="question-course-groups">
          {courseGroups.map((course) => {
            const expanded = expandedCourseIds.includes(course.id)
            const panelId = `question-course-panel-${course.id}`
            const courseQuestionIds = course.questions.map(
              (question) => question.id,
            )
            const allCourseQuestionsSelected =
              courseQuestionIds.length > 0 &&
              courseQuestionIds.every((id) =>
                selectedIds.includes(id),
              )

            return (
              <section className="question-course-group" key={course.id}>
                <header className="question-course-group__header">
                  <div className="question-course-group__summary">
                    <div className="question-course-group__identity">
                      <span className="course-code">{course.code}</span>

                      <div>
                        <h3>{course.title}</h3>
                        <small>
                          {course.questions.length}{' '}
                          {course.questions.length === 1
                            ? 'question'
                            : 'questions'}
                        </small>
                      </div>
                    </div>

                    <label className="bulk-select-control">
                      <input
                        type="checkbox"
                        checked={allCourseQuestionsSelected}
                        disabled={
                          !courseQuestionIds.length ||
                          bulkAction !== null
                        }
                        onChange={(event) =>
                          toggleSelection(
                            courseQuestionIds,
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
                    {expanded
                      ? 'Hide questions'
                      : 'Show questions'}
                  </button>
                </header>

                {expanded && (
                  <div
                    className="question-table-wrapper"
                    id={panelId}
                    role="region"
                    aria-label={`${course.code} question bank table`}
                    tabIndex="0"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Select</th>
                          <th>Course</th>
                          <th>Question</th>
                          <th>Type</th>
                          <th>Points</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {course.questions.map((question) => (
                          <tr key={question.id}>
                            <td className="table-select-cell">
                              <input
                                aria-label={`Select ${question.title}`}
                                type="checkbox"
                                checked={selectedIds.includes(
                                  question.id,
                                )}
                                disabled={bulkAction !== null}
                                title="Select this question for a bulk action"
                                onChange={(event) =>
                                  toggleSelection(
                                    [question.id],
                                    event.target.checked,
                                  )
                                }
                              />
                            </td>
                            <td>
                              <strong>
                                {question.courses?.code ?? '-'}
                              </strong>
                              <small>
                                {question.modules?.code ?? 'General'}
                              </small>
                            </td>
                            <td>
                              <strong>{question.title}</strong>
                              <small>{question.question_text}</small>
                            </td>
                            <td>
                              {question.question_type ===
                              'multiple_choice'
                                ? 'Multiple choice'
                                : 'True or false'}
                            </td>
                            <td>{Number(question.points)}</td>
                            <td>
                              <span
                                className={`content-status content-status--${question.status}`}
                              >
                                {question.status}
                              </span>
                            </td>
                            <td>
                              <div className="question-action-control">
                                <select
                                  aria-label={`Action for ${question.title}`}
                                  value={
                                    rowActions[question.id] ?? ''
                                  }
                                  disabled={busyId === question.id}
                                  onChange={(event) =>
                                    setRowActions((current) => ({
                                      ...current,
                                      [question.id]:
                                        event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">
                                    Choose action
                                  </option>
                                  {question.status === 'draft' && (
                                    <option value="edit">Edit</option>
                                  )}
                                  <option value="status">
                                    {question.status === 'published'
                                      ? 'Unpublish'
                                      : 'Publish'}
                                  </option>
                                  {question.status === 'draft' && (
                                    <option value="delete">
                                      Delete
                                    </option>
                                  )}
                                </select>
                                <button
                                  className="primary"
                                  type="button"
                                  disabled={
                                    busyId === question.id ||
                                    !rowActions[question.id]
                                  }
                                  onClick={() =>
                                    void handleRowAction(question)
                                  }
                                >
                                  {busyId === question.id
                                    ? 'Working...'
                                    : 'OK'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
