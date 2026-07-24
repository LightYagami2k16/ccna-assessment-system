import { useEffect, useState } from 'react'
import {
  createQuestion,
  getCourses,
  getModules,
} from '../services/questionService'

function newMultipleChoiceOptions() {
  return [
    { optionText: '', isCorrect: true },
    { optionText: '', isCorrect: false },
    { optionText: '', isCorrect: false },
    { optionText: '', isCorrect: false },
  ]
}

function trueFalseOptions() {
  return [
    { optionText: 'True', isCorrect: true },
    { optionText: 'False', isCorrect: false },
  ]
}

export default function QuestionEditor({ user, onQuestionCreated }) {
  const [courses, setCourses] = useState([])
  const [modules, setModules] = useState([])
  const [courseId, setCourseId] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [questionType, setQuestionType] = useState('multiple_choice')
  const [title, setTitle] = useState('')
  const [questionText, setQuestionText] = useState('')
  const [explanation, setExplanation] = useState('')
  const [points, setPoints] = useState(1)
  const [difficulty, setDifficulty] = useState('beginner')
  const [status, setStatus] = useState('draft')
  const [options, setOptions] = useState(newMultipleChoiceOptions)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    getCourses()
      .then((data) => active && setCourses(data))
      .catch((error) => active && setMessage(error.message))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    if (courseId) {
      getModules(courseId)
        .then((data) => active && setModules(data))
        .catch((error) => active && setMessage(error.message))
    }
    return () => {
      active = false
    }
  }, [courseId])

  function handleCourseChange(event) {
    setCourseId(event.target.value)
    setModuleId('')
    setModules([])
  }

  function handleQuestionTypeChange(event) {
    const nextType = event.target.value
    setQuestionType(nextType)
    setOptions(
      nextType === 'multiple_choice'
        ? newMultipleChoiceOptions()
        : trueFalseOptions(),
    )
  }

  function updateOptionText(index, optionText) {
    setOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? { ...option, optionText } : option,
      ),
    )
  }

  function selectCorrectOption(index) {
    setOptions((current) =>
      current.map((option, optionIndex) => ({
        ...option,
        isCorrect: optionIndex === index,
      })),
    )
  }

  function validate() {
    if (!courseId) return 'Select a CCNA course.'
    if (!title.trim()) return 'Enter an internal title.'
    if (!questionText.trim()) return 'Enter the question text.'
    if (Number(points) <= 0) return 'Points must be greater than zero.'
    if (options.some((option) => !option.optionText.trim())) {
      return 'Complete every answer option.'
    }
    if (!options.some((option) => option.isCorrect)) {
      return 'Select the correct answer.'
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

    setSubmitting(true)
    setMessage('')

    try {
      await createQuestion({
        courseId: Number(courseId),
        moduleId,
        createdBy: user.id,
        questionType,
        title: title.trim(),
        questionText: questionText.trim(),
        explanation: explanation.trim(),
        points: Number(points),
        difficulty,
        status,
        options,
      })

      setTitle('')
      setQuestionText('')
      setExplanation('')
      setPoints(1)
      setStatus('draft')
      setOptions(
        questionType === 'multiple_choice'
          ? newMultipleChoiceOptions()
          : trueFalseOptions(),
      )
      setMessage('Question created successfully.')
      await onQuestionCreated?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="question-editor">
      <div className="section-heading">
        <div>
          <span className="eyebrow">INSTRUCTOR TOOLS</span>
          <h2>Create question</h2>
        </div>
        <span className="status-chip">Phase 1.2</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Course
            <select value={courseId} onChange={handleCourseChange} required>
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
              onChange={(event) => setModuleId(event.target.value)}
              disabled={!courseId}
            >
              <option value="">No specific module</option>
              {modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.code} — {module.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Question type
            <select value={questionType} onChange={handleQuestionTypeChange}>
              <option value="multiple_choice">Multiple choice</option>
              <option value="true_false">True or false</option>
            </select>
          </label>
          <label>
            Internal title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Example: Privileged EXEC command"
            />
          </label>
        </div>

        <label>
          Question
          <textarea
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
            rows="4"
            placeholder="Which command enters privileged EXEC mode?"
          />
        </label>

        <fieldset>
          <legend>
            {questionType === 'multiple_choice'
              ? 'Answer options'
              : 'Correct answer'}
          </legend>
          {options.map((option, index) => (
            <div className="question-option-row" key={`${questionType}-${index}`}>
              <input
                type="radio"
                name="correct-option"
                checked={option.isCorrect}
                onChange={() => selectCorrectOption(index)}
                aria-label={`Mark ${option.optionText || `option ${index + 1}`} as correct`}
              />
              {questionType === 'multiple_choice' ? (
                <input
                  value={option.optionText}
                  onChange={(event) => updateOptionText(index, event.target.value)}
                  placeholder={`Option ${index + 1}`}
                />
              ) : (
                <span>{option.optionText}</span>
              )}
            </div>
          ))}
        </fieldset>

        <label>
          Explanation
          <textarea
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            rows="3"
            placeholder="Optional feedback shown after results are released."
          />
        </label>

        <div className="form-grid form-grid--three">
          <label>
            Points
            <input
              type="number"
              min="0.25"
              step="0.25"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
            />
          </label>
          <label>
            Difficulty
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
        </div>

        <button className="primary form-submit" type="submit" disabled={submitting}>
          {submitting ? 'Saving question…' : 'Create question'}
        </button>
        {message && <p className="form-message">{message}</p>}
      </form>
    </section>
  )
}
