import { useState } from 'react'
import {
  deleteQuestion,
  setQuestionStatus,
} from '../services/questionService'

export default function QuestionList({ questions, onEdit, onChanged }) {
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState(null)

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
                    <div className="question-actions">
                      <button
                        className="secondary"
                        type="button"
                        disabled={question.status !== 'draft' || busyId === question.id}
                        title={
                          question.status === 'draft'
                            ? 'Edit this draft'
                            : 'Unpublish this question before editing it'
                        }
                        onClick={() => onEdit(question)}
                      >
                        Edit
                      </button>
                      <button
                        className={`status-toggle-button ${
                          question.status === 'published' ? 'secondary' : 'primary'
                        }`}
                        type="button"
                        disabled={busyId === question.id}
                        onClick={() => void handleStatusChange(question)}
                      >
                        {busyId === question.id
                          ? 'Updating...'
                          : question.status === 'published'
                            ? 'Unpublish'
                            : 'Publish'}
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        disabled={question.status !== 'draft' || busyId === question.id}
                        onClick={() => void handleDelete(question)}
                      >
                        Delete
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
