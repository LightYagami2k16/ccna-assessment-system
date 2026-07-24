import { useState } from 'react'
import { deleteQuestion } from '../services/questionService'

export default function QuestionList({ questions, onQuestionDeleted }) {
  const [message, setMessage] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  async function handleDelete(question) {
    if (!window.confirm(`Delete the draft question “${question.title}”?`)) return

    setDeletingId(question.id)
    setMessage('')
    try {
      await deleteQuestion(question.id)
      await onQuestionDeleted?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setDeletingId(null)
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question) => (
                <tr key={question.id}>
                  <td>
                    <strong>{question.courses?.code ?? '—'}</strong>
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
                    <button
                      className="secondary"
                      type="button"
                      disabled={question.status !== 'draft' || deletingId === question.id}
                      onClick={() => void handleDelete(question)}
                    >
                      {deletingId === question.id ? 'Deleting…' : 'Delete'}
                    </button>
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
