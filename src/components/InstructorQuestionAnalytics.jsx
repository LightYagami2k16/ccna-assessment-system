import { useCallback, useEffect, useMemo, useState } from 'react'
import { getInstructorQuestionAnalytics } from '../services/instructorResultsService'
import {
  ResponsiveGrid,
  SectionHeader,
  SurfaceCard,
} from './LayoutPrimitives'

const courseOrder = { ITN: 1, SRWE: 2, ENSA: 3 }

function escapeCsv(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function formatQuestionType(value) {
  return String(value || 'question')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0))
  if (seconds < 60) return `${seconds} sec`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes} min ${remainder} sec`
}

function downloadQuestionCsv(questions) {
  const headers = [
    'Course', 'Module', 'Question', 'Type', 'Configured difficulty',
    'Performance band', 'Presented', 'Answered', 'Correct', 'Incorrect',
    'Unanswered', 'Accuracy (%)', 'Response rate (%)', 'Average time (seconds)',
  ]
  const rows = questions.map((question) => [
    question.courseCode,
    question.moduleCode || '',
    question.title,
    formatQuestionType(question.questionType),
    question.difficulty,
    question.performanceBand,
    question.attemptCount,
    question.answeredCount,
    question.correctCount,
    question.incorrectCount,
    question.unansweredCount,
    Number(question.accuracyPercentage || 0).toFixed(2),
    Number(question.responseRate || 0).toFixed(2),
    Math.round(Number(question.averageTimeSeconds) || 0),
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n')
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `ccna-question-analytics-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function QuestionAnalyticsRow({ question }) {
  const [expanded, setExpanded] = useState(false)
  const options = question.optionDistribution ?? []
  const accuracy = Number(question.accuracyPercentage) || 0

  return (
    <SurfaceCard as="article" subtle className="question-analytics-row">
      <button
        className="question-analytics-row__summary"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="question-analytics-row__identity">
          <span className="course-code">
            {question.courseCode}
            {question.moduleCode ? ` / ${question.moduleCode}` : ''}
          </span>
          <strong>{question.title}</strong>
          <small>{formatQuestionType(question.questionType)}</small>
        </span>
        <span className="question-analytics-row__metric">
          <small>Accuracy</small><strong>{accuracy.toFixed(1)}%</strong>
        </span>
        <span className="question-analytics-row__metric">
          <small>Incorrect</small><strong>{question.incorrectCount}</strong>
        </span>
        <span className="question-analytics-row__metric">
          <small>Average time</small><strong>{formatDuration(question.averageTimeSeconds)}</strong>
        </span>
        <span className={`performance-chip performance-chip--${String(question.performanceBand).toLowerCase().replaceAll(' ', '-')}`}>
          {question.performanceBand}
        </span>
        <span className="question-analytics-row__toggle">
          {expanded ? 'Hide' : 'Review'}
        </span>
      </button>

      {expanded && (
        <div className="question-analytics-row__details">
          <p>{question.questionText}</p>
          <dl className="question-analytics-detail-grid">
            <div><dt>Presented</dt><dd>{question.attemptCount}</dd></div>
            <div><dt>Answered</dt><dd>{question.answeredCount}</dd></div>
            <div><dt>Correct</dt><dd>{question.correctCount}</dd></div>
            <div><dt>Incorrect</dt><dd>{question.incorrectCount}</dd></div>
            <div><dt>Unanswered</dt><dd>{question.unansweredCount}</dd></div>
            <div><dt>Response rate</dt><dd>{Number(question.responseRate || 0).toFixed(1)}%</dd></div>
          </dl>
          {options.length > 0 && (
            <div className="question-option-distribution">
              <h4>Answer selection distribution</h4>
              {options.map((option) => {
                const selections = Number(option.selectionCount) || 0
                const rate = question.answeredCount
                  ? Math.min(100, (selections / question.answeredCount) * 100)
                  : 0
                return (
                  <div className="question-option-distribution__row" key={option.optionId}>
                    <div>
                      <span>{option.optionText}</span>
                      {option.isCorrect && <small>Correct answer</small>}
                    </div>
                    <div className="question-option-distribution__bar" aria-hidden="true">
                      <span style={{ width: `${rate}%` }} />
                    </div>
                    <strong>{selections}</strong>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </SurfaceCard>
  )
}

function QuestionCourseGroup({ courseCode, questions }) {
  const [expanded, setExpanded] = useState(false)
  const answeredQuestions = questions.filter(
    (question) => Number(question.answeredCount) > 0,
  )
  const averageAccuracy = answeredQuestions.length
    ? answeredQuestions.reduce(
        (total, question) =>
          total + Number(question.accuracyPercentage || 0),
        0,
      ) / answeredQuestions.length
    : 0
  const needsReview = questions.filter(
    (question) => question.performanceBand === 'Needs review',
  ).length

  return (
    <SurfaceCard as="section" subtle className="question-analytics-course-group">
      <button
        className="question-analytics-course-group__toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="question-analytics-course-group__identity">
          <span className="course-code">{courseCode}</span>
          <span>
            <strong>{questions.length} questions</strong>
            <small>Question performance and response details</small>
          </span>
        </span>
        <span className="question-analytics-course-group__summary">
          <span><small>Average accuracy</small><strong>{averageAccuracy.toFixed(1)}%</strong></span>
          <span><small>Need review</small><strong>{needsReview}</strong></span>
        </span>
        <span className="question-analytics-course-group__action">
          {expanded ? 'Hide questions' : 'Show questions'}
        </span>
      </button>

      {expanded && (
        <div className="question-analytics-course-group__content">
          {questions.map((question) => (
            <QuestionAnalyticsRow
              key={question.questionId}
              question={question}
            />
          ))}
        </div>
      )}
    </SurfaceCard>
  )
}

export default function InstructorQuestionAnalytics() {
  const [questions, setQuestions] = useState([])
  const [courseFilter, setCourseFilter] = useState('all')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      setQuestions(await getInstructorQuestionAnalytics())
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadAnalytics() }, [loadAnalytics])

  const courses = useMemo(() => [...new Set(
    questions.map((question) => question.courseCode).filter(Boolean),
  )].sort((left, right) =>
    (courseOrder[left] ?? 98) - (courseOrder[right] ?? 98)
      || left.localeCompare(right),
  ), [questions])

  const modules = useMemo(() => [...new Map(
    questions
      .filter((question) => courseFilter === 'all' || question.courseCode === courseFilter)
      .filter((question) => question.moduleCode)
      .map((question) => [question.moduleCode, question.moduleTitle]),
  )].sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true })), [courseFilter, questions])

  const types = useMemo(() => [...new Set(
    questions.map((question) => question.questionType).filter(Boolean),
  )].sort(), [questions])

  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLowerCase()
    return questions.filter((question) =>
      (courseFilter === 'all' || question.courseCode === courseFilter)
      && (moduleFilter === 'all' || question.moduleCode === moduleFilter)
      && (typeFilter === 'all' || question.questionType === typeFilter)
      && (!term || `${question.title} ${question.questionText}`.toLowerCase().includes(term)),
    )
  }, [courseFilter, moduleFilter, questions, search, typeFilter])

  const metrics = useMemo(() => {
    const answered = filteredQuestions.filter((question) => question.answeredCount > 0)
    const averageAccuracy = answered.length
      ? answered.reduce((total, question) => total + Number(question.accuracyPercentage || 0), 0) / answered.length
      : 0
    return {
      questions: filteredQuestions.length,
      responses: filteredQuestions.reduce((total, question) => total + Number(question.answeredCount || 0), 0),
      averageAccuracy,
      needsReview: filteredQuestions.filter((question) => question.performanceBand === 'Needs review').length,
    }
  }, [filteredQuestions])

  const questionGroups = useMemo(() => {
    const groups = new Map()
    for (const question of filteredQuestions) {
      const courseCode = question.courseCode || 'Other'
      if (!groups.has(courseCode)) groups.set(courseCode, [])
      groups.get(courseCode).push(question)
    }
    return [...groups.entries()].sort(([left], [right]) =>
      (courseOrder[left] ?? 98) - (courseOrder[right] ?? 98)
        || left.localeCompare(right),
    )
  }, [filteredQuestions])

  function changeCourse(value) {
    setCourseFilter(value)
    setModuleFilter('all')
  }

  return (
    <section className="question-analytics-panel">
      <SectionHeader
        className="section-heading"
        eyebrow="QUESTION ANALYTICS"
        title="Question performance"
        description="Find difficult items, low response rates, and questions that consume the most time."
        actions={<div className="question-analytics-panel__actions">
          <button className="secondary" type="button" disabled={!filteredQuestions.length}
            onClick={() => downloadQuestionCsv(filteredQuestions)}>Export question CSV</button>
          <button className="secondary" type="button" disabled={loading}
            onClick={() => void loadAnalytics()}>{loading ? 'Refreshing...' : 'Refresh analytics'}</button>
        </div>}
      />

      <ResponsiveGrid className="question-analytics-filters" min="11rem">
        <label>Course<select value={courseFilter} onChange={(event) => changeCourse(event.target.value)}>
          <option value="all">All courses</option>
          {courses.map((course) => <option key={course} value={course}>{course}</option>)}
        </select></label>
        <label>Module<select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
          <option value="all">All modules</option>
          {modules.map(([code, title]) => <option key={code} value={code}>{code} — {title}</option>)}
        </select></label>
        <label>Question type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All types</option>
          {types.map((type) => <option key={type} value={type}>{formatQuestionType(type)}</option>)}
        </select></label>
        <label>Search<input value={search} placeholder="Question title or text"
          onChange={(event) => setSearch(event.target.value)} /></label>
      </ResponsiveGrid>

      <ResponsiveGrid className="results-metrics question-analytics-metrics" min="10rem">
        <SurfaceCard as="article" subtle><span>Questions measured</span><strong>{metrics.questions}</strong></SurfaceCard>
        <SurfaceCard as="article" subtle><span>Student responses</span><strong>{metrics.responses}</strong></SurfaceCard>
        <SurfaceCard as="article" subtle><span>Average accuracy</span><strong>{metrics.averageAccuracy.toFixed(1)}%</strong></SurfaceCard>
        <SurfaceCard as="article" subtle><span>Need review</span><strong>{metrics.needsReview}</strong></SurfaceCard>
      </ResponsiveGrid>

      <div className="question-analytics-list">
        {questionGroups.map(([courseCode, courseQuestions]) => (
          <QuestionCourseGroup
            key={courseCode}
            courseCode={courseCode}
            questions={courseQuestions}
          />
        ))}
      </div>

      {!loading && !filteredQuestions.length && (
        <div className="empty-state"><h3>No question analytics yet</h3><p>Completed quiz attempts will produce question-level performance data here.</p></div>
      )}
      {message && <p className="form-message form-message--error" role="alert">{message}</p>}
    </section>
  )
}
