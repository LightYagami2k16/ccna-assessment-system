import { useCallback, useEffect, useMemo, useState } from 'react'
import { getInstructorCliResults } from '../services/cliLabService'
import { getInstructorAttempts } from '../services/instructorResultsService'
import InstructorQuestionAnalytics from './InstructorQuestionAnalytics'
import InstructorPerformanceTrends from './InstructorPerformanceTrends'
import {
  ResponsiveGrid,
  SectionHeader,
  SurfaceCard,
} from './LayoutPrimitives'

const courseOrder = { ITN: 1, SRWE: 2, ENSA: 3, OTHER: 99 }

function attemptDurationSeconds(attempt) {
  if (Number.isFinite(Number(attempt.timeUsedSeconds))) {
    return Math.max(0, Number(attempt.timeUsedSeconds))
  }
  const started = new Date(attempt.startedAt).getTime()
  const ended = new Date(attempt.submittedAt ?? attempt.expiresAt).getTime()
  return Number.isFinite(started) && Number.isFinite(ended)
    ? Math.max(0, Math.round((ended - started) / 1000))
    : 0
}

function summarize(attempts) {
  const completed = attempts.filter((attempt) =>
    ['submitted', 'expired'].includes(attempt.status),
  )
  const graded = completed.filter((attempt) => attempt.passed != null)
  const passed = graded.filter((attempt) => attempt.passed === true)
  const average = graded.length
    ? graded.reduce(
        (total, attempt) => total + Number(attempt.percentage || 0),
        0,
      ) / graded.length
    : 0
  const averageDurationSeconds = completed.length
    ? completed.reduce(
        (total, attempt) => total + attemptDurationSeconds(attempt),
        0,
      ) / completed.length
    : 0

  return {
    total: attempts.length,
    active: attempts.filter((attempt) => attempt.status === 'in_progress').length,
    completed: completed.length,
    completionRate: attempts.length ? (completed.length / attempts.length) * 100 : 0,
    uniqueStudents: new Set(attempts.map((attempt) => attempt.studentId).filter(Boolean)).size,
    passRate: graded.length ? (passed.length / graded.length) * 100 : 0,
    average,
    averageDurationSeconds,
    eventCount: attempts.reduce(
      (total, attempt) => total + Number(attempt.eventCount || 0),
      0,
    ),
  }
}

function formatDuration(seconds) {
  const minutes = Math.round(Number(seconds || 0) / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return `${hours} hr${hours === 1 ? '' : 's'} ${remainder} min`
}

function groupAttempts(attempts, keyFor, labelFor) {
  const groups = new Map()
  for (const attempt of attempts) {
    const key = keyFor(attempt)
    if (!groups.has(key)) {
      groups.set(key, { key, label: labelFor(attempt), attempts: [] })
    }
    groups.get(key).attempts.push(attempt)
  }
  return [...groups.values()].map((group) => ({
    ...group,
    metrics: summarize(group.attempts),
  }))
}

function escapeCsv(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function downloadCsv(rows) {
  const headers = [
    'Class', 'Course', 'Assessment type', 'Total attempts', 'Completed',
    'Students', 'Pass rate', 'Average score', 'Average time (seconds)',
    'Integrity events',
  ]
  const csv = [headers, ...rows].map((row) =>
    row.map(escapeCsv).join(','),
  ).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `ccna-overall-results-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function AssessmentSummary({ title, description, metrics }) {
  return (
    <SurfaceCard as="article" subtle className="overall-results-breakdown__card">
      <header>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="status-chip">{metrics.total} attempts</span>
      </header>
      <dl>
        <div><dt>Completed</dt><dd>{metrics.completed}</dd></div>
        <div><dt>Students</dt><dd>{metrics.uniqueStudents}</dd></div>
        <div><dt>Pass rate</dt><dd>{metrics.passRate.toFixed(1)}%</dd></div>
        <div><dt>Average score</dt><dd>{metrics.average.toFixed(1)}%</dd></div>
        <div><dt>Average time</dt><dd>{formatDuration(metrics.averageDurationSeconds)}</dd></div>
        <div><dt>Integrity events</dt><dd>{metrics.eventCount}</dd></div>
      </dl>
    </SurfaceCard>
  )
}

export default function InstructorOverallResults() {
  const [quizAttempts, setQuizAttempts] = useState([])
  const [cliAttempts, setCliAttempts] = useState([])
  const [courseFilter, setCourseFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const loadResults = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      const [quizData, cliData] = await Promise.all([
        getInstructorAttempts(),
        getInstructorCliResults(),
      ])
      setQuizAttempts(quizData.map((attempt) => ({
        ...attempt,
        assessmentType: 'Quiz',
        assessmentTitle: attempt.quizTitle,
      })))
      setCliAttempts(cliData.map((attempt) => ({
        ...attempt,
        assessmentType: 'CLI practical',
        assessmentTitle: attempt.labTitle,
      })))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadResults() }, [loadResults])

  const allAttempts = useMemo(
    () => [...quizAttempts, ...cliAttempts],
    [cliAttempts, quizAttempts],
  )
  const courses = useMemo(() => [...new Set(
    allAttempts.map((attempt) => attempt.courseCode || 'OTHER'),
  )].sort((left, right) =>
    (courseOrder[left] ?? 98) - (courseOrder[right] ?? 98)
      || left.localeCompare(right),
  ), [allAttempts])
  const classes = useMemo(() => groupAttempts(
    allAttempts,
    (attempt) => attempt.classId || 'unassigned',
    (attempt) => attempt.className || 'Unassigned students',
  ).sort((left, right) => left.label.localeCompare(right.label)), [allAttempts])
  const filteredAttempts = useMemo(() => allAttempts.filter((attempt) =>
    (courseFilter === 'all' || (attempt.courseCode || 'OTHER') === courseFilter)
    && (classFilter === 'all' || (attempt.classId || 'unassigned') === classFilter),
  ), [allAttempts, classFilter, courseFilter])

  const quizMetrics = useMemo(
    () => summarize(filteredAttempts.filter((attempt) => attempt.assessmentType === 'Quiz')),
    [filteredAttempts],
  )
  const cliMetrics = useMemo(
    () => summarize(filteredAttempts.filter((attempt) => attempt.assessmentType === 'CLI practical')),
    [filteredAttempts],
  )
  const overallMetrics = useMemo(() => summarize(filteredAttempts), [filteredAttempts])
  const courseGroups = useMemo(() => groupAttempts(
    filteredAttempts,
    (attempt) => attempt.courseCode || 'OTHER',
    (attempt) => attempt.courseCode || 'OTHER',
  ).sort((left, right) =>
    (courseOrder[left.key] ?? 98) - (courseOrder[right.key] ?? 98),
  ), [filteredAttempts])
  const classGroups = useMemo(() => groupAttempts(
    filteredAttempts,
    (attempt) => attempt.classId || 'unassigned',
    (attempt) => attempt.className || 'Unassigned students',
  ).sort((left, right) => left.label.localeCompare(right.label)), [filteredAttempts])

  function exportSummary() {
    const rows = classGroups.flatMap((classGroup) =>
      groupAttempts(
        classGroup.attempts,
        (attempt) => `${attempt.courseCode}:${attempt.assessmentType}`,
        (attempt) => `${attempt.courseCode}:${attempt.assessmentType}`,
      ).map((group) => {
        const sample = group.attempts[0]
        return [
          classGroup.label,
          sample.courseCode,
          sample.assessmentType,
          group.metrics.total,
          group.metrics.completed,
          group.metrics.uniqueStudents,
          group.metrics.passRate.toFixed(2),
          group.metrics.average.toFixed(2),
          Math.round(group.metrics.averageDurationSeconds),
          group.metrics.eventCount,
        ]
      }),
    )
    downloadCsv(rows)
  }

  return (
    <section className="overall-results-panel">
      <SectionHeader
        className="section-heading"
        eyebrow="ASSESSMENT REPORTING"
        title="Overall results"
        description="Combined performance across quizzes and CLI practicals."
        actions={<div className="overall-results-panel__actions">
          <button className="secondary" type="button" disabled={!filteredAttempts.length}
            onClick={exportSummary}>Export summary CSV</button>
          <button className="secondary" type="button"
            disabled={loading} onClick={() => void loadResults()}>
            {loading ? 'Refreshing...' : 'Refresh overview'}
          </button>
        </div>}
      />

      <ResponsiveGrid className="overall-results-filters" min="12rem" aria-label="Overall result filters">
        <label>
          Course
          <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
            <option value="all">All courses</option>
            {courses.map((course) => <option key={course} value={course}>{course}</option>)}
          </select>
        </label>
        <label>
          Class
          <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
            <option value="all">All classes</option>
            {classes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
      </ResponsiveGrid>

      <ResponsiveGrid className="results-metrics" min="9rem" aria-label="Overall assessment results">
        <SurfaceCard as="article" subtle><span>Total attempts</span><strong>{overallMetrics.total}</strong></SurfaceCard>
        <SurfaceCard as="article" subtle><span>Completed</span><strong>{overallMetrics.completed}</strong></SurfaceCard>
        <SurfaceCard as="article" subtle><span>Students</span><strong>{overallMetrics.uniqueStudents}</strong></SurfaceCard>
        <SurfaceCard as="article" subtle><span>Pass rate</span><strong>{overallMetrics.passRate.toFixed(1)}%</strong></SurfaceCard>
        <SurfaceCard as="article" subtle><span>Average score</span><strong>{overallMetrics.average.toFixed(1)}%</strong></SurfaceCard>
        <SurfaceCard as="article" subtle><span>Integrity events</span><strong>{overallMetrics.eventCount}</strong></SurfaceCard>
      </ResponsiveGrid>

      <ResponsiveGrid className="overall-results-breakdown" min="20rem">
        <AssessmentSummary title="Quiz results"
          description="Knowledge and concept assessments" metrics={quizMetrics} />
        <AssessmentSummary title="CLI practical results"
          description="Cisco configuration assessments" metrics={cliMetrics} />
      </ResponsiveGrid>

      <section className="overall-results-course-section">
        <SectionHeader className="section-heading section-heading--compact" title="Performance by course" titleAs="h3" description="Compare ITN, SRWE, and ENSA outcomes." />
        <ResponsiveGrid className="overall-results-course-grid" min="17rem">
          {courseGroups.map((group) => (
            <SurfaceCard as="article" subtle key={group.key} className="overall-results-course-card">
              <span className="course-code">{group.label}</span>
              <strong>{group.metrics.average.toFixed(1)}%</strong>
              <span>Average score</span>
              <dl>
                <div><dt>Attempts</dt><dd>{group.metrics.total}</dd></div>
                <div><dt>Pass rate</dt><dd>{group.metrics.passRate.toFixed(1)}%</dd></div>
                <div><dt>Students</dt><dd>{group.metrics.uniqueStudents}</dd></div>
                <div><dt>Events</dt><dd>{group.metrics.eventCount}</dd></div>
              </dl>
            </SurfaceCard>
          ))}
        </ResponsiveGrid>
      </section>

      <section className="overall-results-class-section">
        <SectionHeader className="section-heading section-heading--compact" title="Performance by class" titleAs="h3" description="Class-level completion, scoring, and integrity summary." />
        <div className="results-table-wrapper" role="region" aria-label="Class performance table" tabIndex="0">
          <table className="results-table overall-results-class-table">
            <thead><tr>
              <th>Class</th><th>Students</th><th>Attempts</th><th>Completed</th>
              <th>Pass rate</th><th>Average</th><th>Average time</th><th>Events</th>
            </tr></thead>
            <tbody>
              {classGroups.map((group) => (
                <tr key={group.key}>
                  <td><strong>{group.label}</strong></td>
                  <td>{group.metrics.uniqueStudents}</td>
                  <td>{group.metrics.total}</td>
                  <td>{group.metrics.completed}</td>
                  <td>{group.metrics.passRate.toFixed(1)}%</td>
                  <td>{group.metrics.average.toFixed(1)}%</td>
                  <td>{formatDuration(group.metrics.averageDurationSeconds)}</td>
                  <td>{group.metrics.eventCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!loading && !filteredAttempts.length && (
        <div className="empty-state"><h3>No matching results</h3><p>Adjust the filters or wait for students to complete an assessment.</p></div>
      )}
      {message && <p className="form-message form-message--error" role="alert">{message}</p>}
      <InstructorQuestionAnalytics />
      <InstructorPerformanceTrends />
    </section>
  )
}
