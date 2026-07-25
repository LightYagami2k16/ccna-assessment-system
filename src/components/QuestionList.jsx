import { useEffect, useMemo, useState } from 'react'
import {
  deleteQuestion,
  deleteQuestions,
  setQuestionStatus,
  setQuestionsStatus,
} from '../services/questionService'

export default function QuestionList({ questions, onEdit, onChanged }) {
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkAction, setBulkAction] = useState(null)
  const [rowActions, setRowActions] = useState({})

  const questionIds = useMemo(
    () => questions.map((question) => question.id),
    [questions],
  )

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

  function toggleSelection(ids, checked) {
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, ...ids])]
        : current.filter((id) => !ids.includes(id)),
    )
  }

  async function handleDelete(question) {
    if (!window.confirm(`Delete the draft question "${question.title}"?`)) return

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
    if (!window.confirm(`${verb} "${question.title}"?`)) return

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

    if (
      !window.confirm(
        `Delete ${selectedIds.length} selected draft ${
          selectedIds.length === 1 ? 'question' : 'questions'
        }?\n\nQuestions with student attempt history cannot be deleted. This cannot be undone.`,
      )
    ) {
      return
    }

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
    if (
      !window.confirm(
        `${verb} ${selectedIds.length} selected ${
          selectedIds.length === 1 ? 'question' : 'questions'
        }?`,
      )
    ) {
      return
    }

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
        <div className="question-table-wrapper">
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
              {questions.map((question) => (
                <tr key={question.id}>
                  <td className="table-select-cell">
                    <input
                      aria-label={`Select ${question.title}`}
                      type="checkbox"
                      checked={selectedIds.includes(question.id)}
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
                    <strong>{question.courses?.code ?? '-'}</strong>
                    <small>{question.modules?.code ?? 'General'}</small>
                  </td>
                  <td>
                    <strong>{question.title}</strong>
                    <small>{question.question_text}</small>
                  </td>
                  <td>
                    {question.question_type === 'multiple_choice'
                      ? 'Multiple choice'
                      : 'True or false'}
                  </td>
                  <td>{Number(question.points)}</td>
                  <td>
                    <span className={`content-status content-status--${question.status}`}>
                      {question.status}
                    </span>
                  </td>
                  <td>
                    <div className="question-action-control">
                      <select
                        aria-label={`Action for ${question.title}`}
                        value={rowActions[question.id] ?? ''}
                        disabled={busyId === question.id}
                        onChange={(event) =>
                          setRowActions((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Choose action</option>
                        {question.status === 'draft' && (
                          <option value="edit">Edit</option>
                        )}
                        <option value="status">
                          {question.status === 'published'
                            ? 'Unpublish'
                            : 'Publish'}
                        </option>
                        {question.status === 'draft' && (
                          <option value="delete">Delete</option>
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
                        {busyId === question.id ? 'Working...' : 'OK'}
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
}
