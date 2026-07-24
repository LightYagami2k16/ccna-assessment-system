import { useMemo, useState } from 'react'
import { saveInstructorQuiz } from '../services/quizBuilderService'

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localTime.toISOString().slice(0, 16)
}

function toIsoDateTime(value) {
  return value ? new Date(value).toISOString() : ''
}

export default function QuizEditor({
  quiz,
  courses,
  modules,
  questions,
  onCourseChange,
  onSaved,
  onCancel,
}) {
  const [courseId, setCourseId] = useState(String(quiz?.course_id ?? ''))
  const [moduleId, setModuleId] = useState(quiz?.module_id ?? '')
  const [title, setTitle] = useState(quiz?.title ?? '')
  const [description, setDescription] = useState(quiz?.description ?? '')
  const [instructions, setInstructions] = useState(quiz?.instructions ?? '')
  const [durationMinutes, setDurationMinutes] = useState(quiz?.duration_minutes ?? 15)
  const [maxAttempts, setMaxAttempts] = useState(quiz?.max_attempts ?? 1)
  const [passingScore, setPassingScore] = useState(quiz?.passing_score ?? 70)
  const [status, setStatus] = useState(quiz?.status ?? 'draft')
  const [randomizeQuestions, setRandomizeQuestions] = useState(
    quiz?.randomize_questions ?? false,
  )
  const [randomizeOptions, setRandomizeOptions] = useState(
    quiz?.randomize_options ?? false,
  )
  const [availableFrom, setAvailableFrom] = useState(
    toLocalDateTime(quiz?.available_from),
  )
  const [availableUntil, setAvailableUntil] = useState(
    toLocalDateTime(quiz?.available_until),
  )
  const [selectedQuestionIds, setSelectedQuestionIds] = useState(
    () => quiz?.quiz_questions?.map((item) => item.question_id) ?? [],
  )
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const eligibleQuestions = useMemo(
    () =>
      questions.filter(
        (question) =>
          String(question.course_id) === courseId &&
          (!moduleId || !question.module_id || question.module_id === moduleId),
      ),
    [courseId, moduleId, questions],
  )

  const selectedQuestions = useMemo(
    () =>
      selectedQuestionIds
        .map((questionId) => questions.find((question) => question.id === questionId))
        .filter(Boolean),
    [questions, selectedQuestionIds],
  )

  function handleCourseSelection(event) {
    const nextCourseId = event.target.value
    setCourseId(nextCourseId)
    setModuleId('')
    setSelectedQuestionIds([])
    onCourseChange(nextCourseId)
  }

  function toggleQuestion(questionId) {
    setSelectedQuestionIds((current) =>
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId],
    )
  }

  function moveQuestion(index, direction) {
    setSelectedQuestionIds((current) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.length) return current
      const reordered = [...current]
      ;[reordered[index], reordered[nextIndex]] = [
        reordered[nextIndex],
        reordered[index],
      ]
      return reordered
    })
  }

  function validate() {
    if (!courseId) return 'Select a course.'
    if (!title.trim()) return 'Enter a quiz title.'
    if (Number(durationMinutes) < 1 || Number(durationMinutes) > 480) {
      return 'Duration must be between 1 and 480 minutes.'
    }
    if (Number(maxAttempts) < 1 || Number(maxAttempts) > 100) {
      return 'Maximum attempts must be between 1 and 100.'
    }
    if (Number(passingScore) < 0 || Number(passingScore) > 100) {
      return 'Passing score must be between 0 and 100.'
    }
    if (status === 'published' && selectedQuestionIds.length === 0) {
      return 'Select at least one question before publishing.'
    }
    if (
      status === 'published' &&
      selectedQuestions.some((question) => question.status !== 'published')
    ) {
      return 'Every selected question must be published first.'
    }
    if (
      availableFrom &&
      availableUntil &&
      new Date(availableFrom) >= new Date(availableUntil)
    ) {
      return 'Available until must be later than available from.'
    }
    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validationMessage = validate()
    if (validationMessage) {
      setMessage(validationMessage)
      return
    }

    setSaving(true)
    setMessage('')
    try {
      const quizId = await saveInstructorQuiz({
        id: quiz?.id ?? '',
        courseId: Number(courseId),
        moduleId,
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        durationMinutes: Number(durationMinutes),
        maxAttempts: Number(maxAttempts),
        passingScore: Number(passingScore),
        status,
        randomizeQuestions,
        randomizeOptions,
        showResultsImmediately: true,
        availableFrom: toIsoDateTime(availableFrom),
        availableUntil: toIsoDateTime(availableUntil),
        questionIds: selectedQuestionIds,
      })
      await onSaved(quizId)
    } catch (error) {
      const migrationHint = error.message?.includes('save_instructor_quiz')
        ? ' Run migration 006_instructor_quiz_builder.sql in Supabase first.'
        : ''
      setMessage(`${error.message}${migrationHint}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="quiz-editor">
      <div className="section-heading">
        <div>
          <span className="eyebrow">QUIZ BUILDER</span>
          <h2>{quiz ? 'Edit quiz' : 'Create quiz'}</h2>
          <p>Configure the assessment and choose questions from your bank.</p>
        </div>
        <button className="secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Course
            <select value={courseId} onChange={handleCourseSelection} required>
              <option value="">Select course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} — {course.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Module
            <select
              value={moduleId}
              onChange={(event) => {
                setModuleId(event.target.value)
                setSelectedQuestionIds([])
              }}
              disabled={!courseId}
            >
              <option value="">All modules</option>
              {modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.code} — {module.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Quiz title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Example: ITN Basic Device Configuration Quiz"
          />
        </label>
        <label>
          Description
          <textarea
            rows="3"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label>
          Student instructions
          <textarea
            rows="3"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Answer every question before the timer expires."
          />
        </label>

        <div className="form-grid form-grid--three">
          <label>
            Duration in minutes
            <input
              type="number"
              min="1"
              max="480"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
            />
          </label>
          <label>
            Maximum attempts
            <input
              type="number"
              min="1"
              max="100"
              value={maxAttempts}
              onChange={(event) => setMaxAttempts(event.target.value)}
            />
          </label>
          <label>
            Passing score
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={passingScore}
              onChange={(event) => setPassingScore(event.target.value)}
            />
          </label>
        </div>

        <div className="form-grid">
          <label>
            Available from
            <input
              type="datetime-local"
              value={availableFrom}
              onChange={(event) => setAvailableFrom(event.target.value)}
            />
          </label>
          <label>
            Available until
            <input
              type="datetime-local"
              value={availableUntil}
              onChange={(event) => setAvailableUntil(event.target.value)}
            />
          </label>
        </div>

        <div className="quiz-settings">
          <label className="check-control">
            <input
              type="checkbox"
              checked={randomizeQuestions}
              onChange={(event) => setRandomizeQuestions(event.target.checked)}
            />
            Randomize question order
          </label>
          <label className="check-control">
            <input
              type="checkbox"
              checked={randomizeOptions}
              onChange={(event) => setRandomizeOptions(event.target.checked)}
            />
            Randomize answer options
          </label>
        </div>

        <section className="quiz-question-selector">
          <div className="section-heading">
            <div>
              <h3>Select questions</h3>
              <p>{selectedQuestionIds.length} selected</p>
            </div>
          </div>
          {!courseId ? (
            <div className="empty-state">Select a course to view questions.</div>
          ) : !eligibleQuestions.length ? (
            <div className="empty-state">
              No eligible questions were found for this course and module.
            </div>
          ) : (
            <div className="question-picker-list">
              {eligibleQuestions.map((question) => (
                <label className="question-picker-row" key={question.id}>
                  <input
                    type="checkbox"
                    checked={selectedQuestionIds.includes(question.id)}
                    onChange={() => toggleQuestion(question.id)}
                  />
                  <span>
                    <strong>{question.title}</strong>
                    <small>
                      {question.modules?.code ?? 'General'} · {question.points} point(s) ·{' '}
                      {question.status}
                    </small>
                    <small>{question.question_text}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        {selectedQuestions.length > 0 && (
          <section className="selected-question-order">
            <h3>Question order</h3>
            {selectedQuestions.map((question, index) => (
              <div key={question.id}>
                <span>{index + 1}. {question.title}</span>
                <div>
                  <button
                    className="secondary"
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveQuestion(index, -1)}
                  >
                    Up
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={index === selectedQuestions.length - 1}
                    onClick={() => moveQuestion(index, 1)}
                  >
                    Down
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        <div className="quiz-editor__actions">
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <button className="primary form-submit" type="submit" disabled={saving}>
            {saving ? 'Saving quiz…' : quiz ? 'Save changes' : 'Create quiz'}
          </button>
        </div>

        {message && <p className="form-message form-message--error">{message}</p>}
      </form>
    </section>
  )
}
