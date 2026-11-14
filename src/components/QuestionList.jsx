import DataLoadBoundary from './DataLoadBoundary'
import { useEffect, useMemo, useState } from 'react'
import { ListFilter, RotateCcw } from 'lucide-react'
import AppIcon from './AppIcon'
import {
  deleteQuestion,
  deleteQuestions,
  setQuestionStatus,
  setQuestionsStatus,
} from '../services/questionService'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import {
  ActionBar,
  FilterBar,
  SectionHeader,
  SurfaceCard,
} from './LayoutPrimitives'

const QUESTION_TYPE_LABELS = {
  multiple_choice: 'Multiple choice',
  multiple_answer: 'Multiple answers',
  true_false: 'True or false',
  identification: 'Identification',
}

const COURSE_ORDER = { ITN: 1, SRWE: 2, ENSA: 3 }

function questionModuleId(question) {
  return String(question.module_id ?? question.modules?.id ?? 'unassigned')
}

export default function QuestionList({
  loading = false,
  ready = true,
  loadFailed = false,
  questions,
  moduleFilter,
  onModuleFilterChange,
  onEdit,
  onChanged,
}) {
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkAction, setBulkAction] = useState(null)
  const [rowActions, setRowActions] = useState({})
  const [expandedCourseIds, setExpandedCourseIds] = useState([])
  const { confirm, confirmationDialog } = useConfirmationDialog()

  const moduleOptions = useMemo(() => {
    const modules = new Map()
    for (const question of questions) {
      const id = questionModuleId(question)
      if (id === 'unassigned' || modules.has(id)) continue
      const courseCode = question.courses?.code ?? 'OTHER'
      const code = question.modules?.code ?? `Module ${id}`
      const title = question.modules?.title
      modules.set(id, {
        id,
        courseCode,
        code,
        label: `${courseCode} · ${code}${title ? ` — ${title}` : ''}`,
      })
    }
    return [...modules.values()].sort((left, right) =>
      (COURSE_ORDER[left.courseCode] ?? 999) - (COURSE_ORDER[right.courseCode] ?? 999)
      || left.courseCode.localeCompare(right.courseCode)
      || left.code.localeCompare(right.code, undefined, { numeric: true, sensitivity: 'base' })
      || left.label.localeCompare(right.label),
    )
  }, [questions])

  const filteredQuestions = useMemo(
    () => moduleFilter === 'all'
      ? questions
      : questions.filter((question) => questionModuleId(question) === moduleFilter),
    [questions, moduleFilter],
  )

  const questionIds = useMemo(
    () => filteredQuestions.map((question) => question.id),
    [filteredQuestions],
  )

  const courseGroups = useMemo(() => {
    const groups = new Map()

    for (const question of filteredQuestions) {
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

    return [...groups.values()].sort(
      (left, right) =>
        (COURSE_ORDER[left.code] ?? 999) -
          (COURSE_ORDER[right.code] ?? 999) ||
        left.code.localeCompare(right.code, undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
    )
  }, [filteredQuestions])

  const selectedQuestions = useMemo(
    () =>
      filteredQuestions.filter((question) =>
        selectedIds.includes(question.id),
      ),
    [filteredQuestions, selectedIds],
  )
  const selectedQuestionIds = selectedQuestions.map((question) => question.id)

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
    const courseIds = new Set(questions.map((question) => String(
      question.course_id ?? question.courses?.id ?? 'uncategorized',
    )))

    setExpandedCourseIds((current) =>
      current.filter((id) => courseIds.has(id)),
    )
  }, [questions])

  useEffect(() => {
    if (
      moduleFilter !== 'all' && moduleFilter !== 'unassigned'
      && !moduleOptions.some((module) => module.id === moduleFilter)
    ) {
      onModuleFilterChange('all')
      setSelectedIds([])
    }
  }, [moduleFilter, moduleOptions, onModuleFilterChange])

  function changeModuleFilter(value) {
    setSelectedIds([])
    onModuleFilterChange(value)
  }

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
    if (!selectedQuestionIds.length) return

    const confirmed = await confirm({
      title: `Delete ${selectedQuestionIds.length} selected ${
        selectedQuestionIds.length === 1 ? 'question' : 'questions'
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
      await deleteQuestions(selectedQuestionIds)
      setSelectedIds([])
      await onChanged?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBulkAction(null)
    }
  }

  async function handleBulkStatus(status) {
    if (!selectedQuestionIds.length) return

    const verb = status === 'published' ? 'Publish' : 'Unpublish'
    const confirmed = await confirm({
      title: `${verb} selected questions?`,
      message: `${verb} ${selectedQuestionIds.length} selected ${
        selectedQuestionIds.length === 1 ? 'question' : 'questions'
      }?`,
      confirmLabel: `${verb} selected`,
      tone: 'default',
    })
    if (!confirmed) return

    setBulkAction(status)
    setMessage('')
    try {
      await setQuestionsStatus(selectedQuestionIds, status)
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
      <SectionHeader
        className="section-heading"
        eyebrow="CONTENT LIBRARY"
        title="Question bank"
        actions={(
          <div className="loading-panel-actions">
            <span className="status-chip">{ready ? <>{moduleFilter !== 'all' && `${filteredQuestions.length} of `}{questions.length} {questions.length === 1 ? 'question' : 'questions'}</> : '— questions'}</span>
          </div>
        )}
      />

      <DataLoadBoundary error={loadFailed} onRetry={onChanged} loading={loading} ready={ready} label="Loading question bank...">
      <FilterBar className="question-bank-filters">
        <label>
          <span className="question-bank-filters__label">
            <AppIcon icon={ListFilter} size="sm" />
            Module
          </span>
          <select
            value={moduleFilter}
            onChange={(event) => changeModuleFilter(event.target.value)}
            disabled={bulkAction !== null}
          >
            <option value="all">All modules</option>
            {moduleOptions.map((module) => (
              <option key={module.id} value={module.id}>{module.label}</option>
            ))}
            <option value="unassigned">Unassigned module</option>
          </select>
        </label>
        <button
          className="secondary"
          type="button"
          onClick={() => changeModuleFilter('all')}
          disabled={moduleFilter === 'all' || bulkAction !== null}
        >
          <AppIcon icon={RotateCcw} size="sm" />
          Clear filter
        </button>
      </FilterBar>
      <p className="question-bank-filter-status" role="status">
        {moduleFilter === 'all'
          ? `Showing all ${questions.length} questions.`
          : `Showing ${filteredQuestions.length} of ${questions.length} questions.`}
      </p>

      {message && <p className="form-message form-message--error">{message}</p>}
      {!!questions.length && (
        <ActionBar className="bulk-action-bar">
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
            {moduleFilter === 'all' ? 'Select all questions' : 'Select all shown questions'}
          </label>

          <div className="bulk-action-bar__actions">
            <span>{selectedQuestionIds.length} selected</span>
            <button
              className="primary bulk-action-button"
              type="button"
              disabled={!selectedQuestionIds.length || bulkAction !== null}
              onClick={() => void handleBulkStatus('published')}
            >
              {bulkAction === 'published'
                ? 'Publishing...'
                : 'Publish selected'}
            </button>
            <button
              className="secondary bulk-action-button"
              type="button"
              disabled={!selectedQuestionIds.length || bulkAction !== null}
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
        </ActionBar>
      )}

      {!questions.length ? (
        <div className="empty-state">
          <h3>No questions created yet</h3>
          <p>Your first saved question will appear here.</p>
        </div>
      ) : !filteredQuestions.length ? (
        <div className="empty-state">
          <h3>No questions in this module</h3>
          <p>Choose another module or clear the filter to show all questions.</p>
        </div>
      ) : (
        <div className="question-course-groups">
          {courseGroups.map((course) => {
            const expanded = moduleFilter !== 'all' || expandedCourseIds.includes(course.id)
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
              <SurfaceCard
                as="section"
                subtle
                className="question-course-group"
                key={course.id}
              >
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

                  {moduleFilter === 'all' && <button
                    className="module-collapse-button"
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggleCourseGroup(course.id)}
                  >
                    {expanded
                      ? 'Hide questions'
                      : 'Show questions'}
                  </button>}
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
                              {QUESTION_TYPE_LABELS[
                                question.question_type
                              ] ?? question.question_type}
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
              </SurfaceCard>
            )
          })}
        </div>
      )}
      </DataLoadBoundary>
    </section>
  )
}
