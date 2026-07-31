import { useEffect, useState } from 'react'
import { getInstructorAttemptDetail } from '../services/instructorResultsService'

function formatDate(value) {
  if (!value) return 'Not submitted'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function InstructorAttemptReview({ attemptId, onBack }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function loadDetail() {
      try {
        setLoading(true)
        setMessage('')
        const data = await getInstructorAttemptDetail(attemptId)
        if (active) setDetail(data)
      } catch (error) {
        if (active) setMessage(error.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadDetail()
    return () => {
      active = false
    }
  }, [attemptId])

  if (loading) {
    return <section className="attempt-review">Loading attempt review…</section>
  }

  if (!detail) {
    return (
      <section className="attempt-review">
        <button className="secondary" type="button" onClick={onBack}>
          Back to results
        </button>
        <p className="form-message form-message--error">
          {message || 'Attempt details could not be loaded.'}
        </p>
      </section>
    )
  }

  const { attempt, questions = [] } = detail

  return (
    <section className="attempt-review">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ATTEMPT REVIEW</span>
          <h2>{attempt.quizTitle}</h2>
          <p>
            {attempt.studentName} · {attempt.studentEmail || 'No email available'}
          </p>
        </div>
        <button className="secondary" type="button" onClick={onBack}>
          Back to results
        </button>
      </div>

      <div className="attempt-review__summary">
        <div>
          <span>Score</span>
          <strong>{Number(attempt.percentage).toFixed(2)}%</strong>
        </div>
        <div>
          <span>Points</span>
          <strong>
            {Number(attempt.scorePoints)} / {Number(attempt.maximumPoints)}
          </strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{attempt.passed == null ? attempt.status : attempt.passed ? 'Passed' : 'Failed'}</strong>
        </div>
        <div>
          <span>Submitted</span>
          <strong>{formatDate(attempt.submittedAt)}</strong>
        </div>
      </div>

      <div className="attempt-review__questions">
        {questions.map((question, index) => {
          const studentAnswer =
            question.questionType === 'identification'
              ? question.answerText
              : question.selectedOptionTexts?.length
                ? question.selectedOptionTexts.join(', ')
                : question.selectedOptionText
          const answered = Boolean(
            question.questionType === 'identification'
              ? question.answerText?.trim()
              : question.selectedOptionIds?.length ||
                  question.selectedOptionId,
          )
          const stateClass = !answered
            ? 'attempt-question--unanswered'
            : question.isCorrect
              ? 'attempt-question--correct'
              : 'attempt-question--incorrect'

          return (
            <article
              className={`attempt-question ${stateClass}`}
              key={question.attemptQuestionId}
            >
              <header>
                <div>
                  <span>Question {index + 1}</span>
                  <h3>{question.title}</h3>
                </div>
                <strong>
                  {Number(question.pointsAwarded)} / {Number(question.points)} points
                </strong>
              </header>
              <p>{question.questionText}</p>
              <dl>
                <div>
                  <dt>Student answer</dt>
                  <dd>{studentAnswer || 'No answer'}</dd>
                </div>
                <div>
                  <dt>Correct answer</dt>
                  <dd>{question.correctOptions?.join(', ') || 'Not configured'}</dd>
                </div>
              </dl>
              {question.explanation && (
                <div className="attempt-question__explanation">
                  <strong>Explanation</strong>
                  <p>{question.explanation}</p>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
