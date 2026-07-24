import { useCallback, useEffect, useState } from 'react'
import QuestionEditor from './QuestionEditor'
import QuestionList from './QuestionList'
import { getInstructorQuestions } from '../services/questionService'

export default function InstructorQuestionBank({ user }) {
  const [questions, setQuestions] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingQuestion, setEditingQuestion] = useState(null)

  const loadQuestions = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      setQuestions(await getInstructorQuestions())
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadQuestions()
  }, [loadQuestions])

  return (
    <div className="instructor-question-bank">
      <QuestionEditor
        key={editingQuestion?.id ?? 'new'}
        user={user}
        question={editingQuestion}
        onSaved={async () => {
          setEditingQuestion(null)
          await loadQuestions()
        }}
        onCancel={() => setEditingQuestion(null)}
      />
      {loading ? (
        <section className="question-list">
          <p>Loading question bank...</p>
        </section>
      ) : (
        <QuestionList
          questions={questions}
          onEdit={(question) => setEditingQuestion(question)}
          onChanged={loadQuestions}
        />
      )}
      {message && <p className="form-message form-message--error">{message}</p>}
    </div>
  )
}
