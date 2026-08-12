import { useCallback, useEffect, useMemo, useState } from 'react'
import { getInstructorPerformanceTrends } from '../services/instructorResultsService'
import {
  ResponsiveGrid,
  SectionHeader,
  SurfaceCard,
} from './LayoutPrimitives'

const courseOrder = { ITN: 1, SRWE: 2, ENSA: 3 }

function formatWeek(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function masteryBand(score) {
  if (score >= 80) return 'Strong'
  if (score >= 60) return 'Developing'
  return 'Needs support'
}

function escapeCsv(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function downloadLearningAreaCsv(areas) {
  const headers = [
    'Course', 'Module', 'Learning area', 'Combined mastery (%)',
    'Quiz mastery (%)', 'Quiz responses', 'CLI average (%)',
    'CLI pass rate (%)', 'CLI attempts',
  ]
  const rows = areas.map((area) => [
    area.courseCode,
    area.moduleCode || '',
    area.moduleTitle || 'Course-wide content',
    Number(area.combinedMasteryScore || 0).toFixed(2),
    Number(area.quizMasteryScore || 0).toFixed(2),
    area.quizResponseCount,
    Number(area.cliMasteryScore || 0).toFixed(2),
    Number(area.cliPassRate || 0).toFixed(2),
    area.cliAttemptCount,
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n')
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `ccna-learning-area-analytics-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function TrendChart({ title, rows, type }) {
  const values = rows.filter((row) => row.assessmentType === type)
  return (
    <SurfaceCard as="article" subtle className="performance-trend-card">
      <header>
        <div><h3>{title}</h3><p>Weekly completed-attempt average</p></div>
        <span className="status-chip">{values.reduce((sum, row) => sum + Number(row.attemptCount || 0), 0)} attempts</span>
      </header>
      {!values.length ? (
        <div className="performance-trend-card__empty">No completed attempts in this period.</div>
      ) : (
        <div className="performance-trend-chart">
          {values.map((row) => {
            const score = Number(row.averageScore) || 0
            return (
              <div className="performance-trend-chart__column" key={`${type}-${row.periodStart}`}>
                <span className="performance-trend-chart__value">{score.toFixed(0)}%</span>
                <div className="performance-trend-chart__track">
                  <span style={{ height: `${Math.max(3, score)}%` }} />
                </div>
                <small>{formatWeek(row.periodStart)}</small>
              </div>
            )
          })}
        </div>
      )}
    </SurfaceCard>
  )
}

function LearningAreaCourse({ courseCode, areas }) {
  const [expanded, setExpanded] = useState(false)
  const average = areas.length
    ? areas.reduce((sum, area) => sum + Number(area.combinedMasteryScore || 0), 0) / areas.length
    : 0
  return (
    <section className="learning-area-course">
      <button type="button" aria-expanded={expanded}
        className="learning-area-course__toggle"
        onClick={() => setExpanded((current) => !current)}>
        <span><span className="course-code">{courseCode}</span><strong>{areas.length} learning areas</strong></span>
        <span><small>Average mastery</small><strong>{average.toFixed(1)}%</strong></span>
        <span className={`performance-chip performance-chip--${masteryBand(average).toLowerCase().replaceAll(' ', '-')}`}>
          {masteryBand(average)}
        </span>
        <span className="learning-area-course__action">{expanded ? 'Hide areas' : 'Show areas'}</span>
      </button>
      {expanded && (
        <div className="learning-area-course__content">
          {areas.map((area) => {
            const score = Number(area.combinedMasteryScore) || 0
            return (
              <article className="learning-area-row" key={`${courseCode}-${area.moduleCode || 'general'}`}>
                <div><strong>{area.moduleCode || 'Course-wide'}</strong><span>{area.moduleTitle || 'General course content'}</span></div>
                <div className="learning-area-row__mastery"><span><i style={{ width: `${score}%` }} /></span><strong>{score.toFixed(1)}%</strong></div>
                <dl>
                  <div><dt>Quiz mastery</dt><dd>{Number(area.quizMasteryScore || 0).toFixed(1)}%</dd></div>
                  <div><dt>Quiz responses</dt><dd>{area.quizResponseCount}</dd></div>
                  <div><dt>CLI average</dt><dd>{Number(area.cliMasteryScore || 0).toFixed(1)}%</dd></div>
                  <div><dt>CLI attempts</dt><dd>{area.cliAttemptCount}</dd></div>
                </dl>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function InstructorPerformanceTrends() {
  const [trends, setTrends] = useState([])
  const [areas, setAreas] = useState([])
  const [courseFilter, setCourseFilter] = useState('all')
  const [range, setRange] = useState('12')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      const data = await getInstructorPerformanceTrends()
      setTrends(data.trends)
      setAreas(data.learningAreas)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const courses = useMemo(() => [...new Set(areas.map((area) => area.courseCode))]
    .sort((left, right) => (courseOrder[left] ?? 98) - (courseOrder[right] ?? 98)), [areas])
  const filteredAreas = useMemo(() => areas.filter((area) =>
    courseFilter === 'all' || area.courseCode === courseFilter,
  ), [areas, courseFilter])
  const filteredTrends = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - Number(range) * 7)
    return trends.filter((row) => new Date(`${row.periodStart}T00:00:00`) >= cutoff)
  }, [range, trends])
  const groups = useMemo(() => {
    const map = new Map()
    for (const area of filteredAreas) {
      if (!map.has(area.courseCode)) map.set(area.courseCode, [])
      map.get(area.courseCode).push(area)
    }
    return [...map.entries()].sort(([left], [right]) =>
      (courseOrder[left] ?? 98) - (courseOrder[right] ?? 98),
    )
  }, [filteredAreas])

  return (
    <section className="performance-trends-panel">
      <SectionHeader
        className="section-heading"
        eyebrow="PERFORMANCE TRENDS"
        title="Progress and learning areas"
        description="Track weekly outcomes and identify course modules that need reinforcement."
        actions={<div className="performance-trends-panel__actions">
          <button className="secondary" type="button" disabled={!filteredAreas.length}
            onClick={() => downloadLearningAreaCsv(filteredAreas)}>Export learning areas</button>
          <button className="secondary" type="button" disabled={loading} onClick={() => void load()}>{loading ? 'Refreshing...' : 'Refresh trends'}</button>
        </div>}
      />
      <ResponsiveGrid className="performance-trends-filters" min="12rem">
        <label>Course<select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}><option value="all">All courses</option>{courses.map((course) => <option key={course} value={course}>{course}</option>)}</select></label>
        <label>Trend period<select value={range} onChange={(event) => setRange(event.target.value)}><option value="4">Last 4 weeks</option><option value="8">Last 8 weeks</option><option value="12">Last 12 weeks</option><option value="52">Last year</option></select></label>
      </ResponsiveGrid>
      <ResponsiveGrid className="performance-trend-grid" min="20rem">
        <TrendChart title="Quiz score trend" rows={filteredTrends} type="quiz" />
        <TrendChart title="CLI score trend" rows={filteredTrends} type="cli" />
      </ResponsiveGrid>
      <section className="learning-area-section">
        <SectionHeader className="section-heading section-heading--compact" title="Mastery by learning area" titleAs="h3" description="Modules combine quiz correctness and CLI practical scores when both are available." />
        <div className="learning-area-list">
          {groups.map(([courseCode, courseAreas]) => <LearningAreaCourse key={courseCode} courseCode={courseCode} areas={courseAreas} />)}
        </div>
      </section>
      {!loading && !filteredAreas.length && <div className="empty-state"><h3>No learning-area results yet</h3><p>Completed quiz or CLI attempts will appear here.</p></div>}
      {message && <p className="form-message form-message--error" role="alert">{message}</p>}
    </section>
  )
}
