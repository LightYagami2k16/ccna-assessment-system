import { useEffect, useState } from 'react'
import {
  createQuestion,
  getCourses,
  getModules,
  updateQuestion,
} from '../services/questionService'
import {
  ActionBar,
  ResponsiveGrid,
  SectionHeader,
} from './LayoutPrimitives'

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

function identificationOptions() {
  return [{ optionText: '', isCorrect: true }]
}

function optionsForType(questionType) {
  if (questionType === 'true_false') return trueFalseOptions()
  if (questionType === 'identification') return identificationOptions()
  return newMultipleChoiceOptions()
}

function optionsForQuestion(question) {
  if (!question) return newMultipleChoiceOptions()
  return (question.question_options ?? []).map((option) => ({
    optionText: option.option_text,
    isCorrect: option.is_correct,
  }))
}

export default function QuestionEditor({
  user,
  question = null,
  onSaved,
  onCancel,
}) {
  const isEditing = Boolean(question)
  const [courses, setCourses] = useState([])
  const [modules, setModules] = useState([])
  const [courseId, setCourseId] = useState(
    question?.course_id ? String(question.course_id) : '',
  )
  const [moduleId, setModuleId] = useState(
    question?.module_id ? String(question.module_id) : '',
  )
  const [questionType, setQuestionType] = useState(
    question?.question_type ?? 'multiple_choice',
  )
  const [title, setTitle] = useState(question?.title ?? '')
  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [explanation, setExplanation] = useState(question?.explanation ?? '')
  const [points, setPoints] = useState(question?.points ?? 1)
  const [difficulty, setDifficulty] = useState(question?.difficulty ?? 'beginner')
  const [status, setStatus] = useState(question?.status ?? 'draft')
  const [options, setOptions] = useState(() => optionsForQuestion(question))
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(isEditing)

  useEffect(() => {
    if (isEditing) {
      setExpanded(true)
    }
  }, [isEditing, question?.id])

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
    setOptions(optionsForType(nextType))
  }

  function resetNewQuestionForm() {
    setCourseId('')
    setModuleId('')
    setModules([])
    setQuestionType('multiple_choice')
    setTitle('')
    setQuestionText('')
    setExplanation('')
    setPoints(1)
    setDifficulty('beginner')
    setStatus('draft')
    setOptions(newMultipleChoiceOptions())
    setMessage('')
  }

  function toggleEditor() {
    if (!expanded && !isEditing) {
      resetNewQuestionForm()
    }

    setExpanded((current) => !current)
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

  function toggleCorrectOption(index) {
    setOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index
          ? { ...option, isCorrect: !option.isCorrect }
          : option,
      ),
    )
  }

  function addAcceptedAnswer() {
    setOptions((current) => [
      ...current,
      { optionText: '', isCorrect: true },
    ])
  }

  function removeAcceptedAnswer(index) {
    setOptions((current) =>
      current.length > 1
        ? current.filter((_, optionIndex) => optionIndex !== index)
        : current,
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
    if (
      questionType === 'multiple_answer' &&
      options.filter((option) => option.isCorrect).length < 2
    ) {
      return 'Select at least two correct answers.'
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
      const commonValues = {
        title: title.trim(),
        questionText: questionText.trim(),
        explanation: explanation.trim(),
        points: Number(points),
        difficulty,
        options,
      }

      if (isEditing) {
        await updateQuestion({
          id: question.id,
          ...commonValues,
        })
      } else {
        await createQuestion({
          courseId: Number(courseId),
          moduleId,
          createdBy: user.id,
          questionType,
          status,
          ...commonValues,
        })
      }

      setMessage(isEditing ? 'Question updated successfully.' : 'Question created successfully.')
      await onSaved?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="question-editor">
      <SectionHeader
        className="section-heading"
        eyebrow="INSTRUCTOR TOOLS"
        title={isEditing ? 'Edit draft question' : 'Create question'}
        description={isEditing
          ? 'Editing is limited to drafts. Publish the question again after reviewing your changes.'
          : 'Create a reusable question for the shared content library.'}
        actions={(<div className="question-editor__heading-controls">
          <span className="status-chip">Draft editor</span>

          <button
            className="module-collapse-button"
            type="button"
            aria-expanded={expanded}
            aria-controls="question-editor-form"
            onClick={toggleEditor}
          >
            {expanded
              ? 'Hide form'
              : isEditing
                ? 'Show form'
                : 'Create question'}
          </button>
        </div>)}
      />

      {expanded && (
      <form id="question-editor-form" onSubmit={handleSubmit}>
        <ResponsiveGrid min="15rem" className="form-grid">
          <label>
            Course
            <select
              value={courseId}
              onChange={handleCourseChange}
              required
              disabled={isEditing}
            >
              <option value="">Select course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} - {course.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Module
            <select
              value={moduleId}
              onChange={(event) => setModuleId(event.target.value)}
              disabled={!courseId || isEditing}
            >
              <option value="">No specific module</option>
              {modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.code} - {module.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Question type
            <select
              value={questionType}
              onChange={handleQuestionTypeChange}
              disabled={isEditing}
            >
              <option value="multiple_choice">Multiple choice</option>
              <option value="multiple_answer">
                Multiple choice — multiple answers
              </option>
              <option value="true_false">True or false</option>
              <option value="identification">Identification</option>
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
        </ResponsiveGrid>

        <label>
          Question
          <textarea
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
            rows="4"
            placeholder="Which command enters privileged EXEC mode?"
          />
        </label>

        <fieldset className="form-fieldset">
          <legend>
            {questionType === 'identification'
              ? 'Accepted answer'
              : questionType === 'multiple_answer'
                ? 'Answer options — select every correct answer'
                : questionType === 'multiple_choice'
                  ? 'Answer options'
                  : 'Correct answer'}
          </legend>
          {options.map((option, index) => (
            <div
              className={[
                'question-option-row',
                questionType === 'identification'
                  ? 'question-option-row--identification'
                  : '',
                questionType === 'identification' && index === 0
                  ? 'question-option-row--required'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={`${questionType}-${index}`}
            >
              {questionType !== 'identification' && (
                <input
                  type={
                    questionType === 'multiple_answer'
                      ? 'checkbox'
                      : 'radio'
                  }
                  name="correct-option"
                  checked={option.isCorrect}
                  onChange={() =>
                    questionType === 'multiple_answer'
                      ? toggleCorrectOption(index)
                      : selectCorrectOption(index)
                  }
                  aria-label={`Mark ${option.optionText || `option ${index + 1}`} as correct`}
                />
              )}
              {questionType === 'multiple_choice' ||
              questionType === 'multiple_answer' ||
              questionType === 'identification' ? (
                <input
                  value={option.optionText}
                  onChange={(event) => updateOptionText(index, event.target.value)}
                  placeholder={
                    questionType === 'identification'
                      ? index === 0
                        ? 'Required correct answer'
                        : `Accepted variation ${index + 1}`
                      : `Option ${index + 1}`
                  }
                />
              ) : (
                <span>{option.optionText}</span>
              )}
              {questionType === 'identification' && index > 0 && (
                <button
                  className="secondary question-option-row__remove"
                  type="button"
                  onClick={() => removeAcceptedAnswer(index)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {questionType === 'identification' && (
            <div className="identification-answer-tools">
              <p>
                Answers are matched without case sensitivity and extra spacing
                is ignored. Add variations only when more than one response
                should be accepted.
              </p>
              <button
                className="secondary"
                type="button"
                onClick={addAcceptedAnswer}
              >
                Add accepted variation
              </button>
            </div>
          )}
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

        <ResponsiveGrid min="14rem" className="form-grid form-grid--three">
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
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              disabled={isEditing}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
        </ResponsiveGrid>

        <ActionBar className="question-editor__actions">
          <button className="primary form-submit" type="submit" disabled={submitting}>
            {submitting
              ? 'Saving question...'
              : isEditing
                ? 'Save changes'
                : 'Create question'}
          </button>
          {isEditing && (
            <button className="secondary" type="button" onClick={onCancel}>
              Cancel editing
            </button>
          )}
        </ActionBar>
        {message && (
          <p className="form-message" role="status" aria-live="polite">
            {message}
          </p>
        )}
      </form>
      )}
    </section>
  )
}
