import { useCallback, useEffect, useMemo, useState } from 'react'
import { getInstructorCliResults } from '../services/cliLabService'
import { getInstructorAttempts } from '../services/instructorResultsService'

function summarize(attempts) {
  const graded = attempts.filter((attempt) => attempt.passed != null)
  const passed = graded.filter((attempt) => attempt.passed === true)
  const average = graded.length
    ? graded.reduce(
        (total, attempt) => total + Number(attempt.percentage || 0),
        0,
      ) / graded.length
    : 0

  return {
    total: attempts.length,
    active: attempts.filter(
      (attempt) => attempt.status === 'in_progress',
    ).length,
    passRate: graded.length ? (passed.length / graded.length) * 100 : 0,
    average,
  }
}

function AssessmentSummary({ title, description, metrics }) {
  return (
    <article className="overall-results-breakdown__card">
      <header>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="status-chip">{metrics.total} attempts</span>
      </header>
      <dl>
        <div><dt>Active now</dt><dd>{metrics.active}</dd></div>
        <div><dt>Pass rate</dt><dd>{metrics.passRate.toFixed(1)}%</dd></div>
        <div><dt>Average score</dt><dd>{metrics.average.toFixed(1)}%</dd></div>
      </dl>
    </article>
  )
}

export default function InstructorOverallResults() {
  const [quizAttempts, setQuizAttempts] = useState([])
  const [cliAttempts, setCliAttempts] = useState([])
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
      setQuizAttempts(quizData)
      setCliAttempts(cliData)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadResults() }, [loadResults])

  const quizMetrics = useMemo(
    () => summarize(quizAttempts),
    [quizAttempts],
  )
  const cliMetrics = useMemo(
    () => summarize(cliAttempts),
    [cliAttempts],
  )
  const overallMetrics = useMemo(
    () => summarize([...quizAttempts, ...cliAttempts]),
    [cliAttempts, quizAttempts],
  )

  return (
    <section className="overall-results-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ASSESSMENT REPORTING</span>
          <h2>Overall results</h2>
          <p>Combined performance across quizzes and CLI practicals.</p>
        </div>
        <button className="secondary" type="button"
          disabled={loading} onClick={() => void loadResults()}>
          {loading ? 'Refreshing...' : 'Refresh overview'}
        </button>
      </div>

      <div className="results-metrics" aria-label="Overall assessment results">
        <article><span>Total attempts</span><strong>{overallMetrics.total}</strong></article>
        <article><span>Active now</span><strong>{overallMetrics.active}</strong></article>
        <article><span>Pass rate</span><strong>{overallMetrics.passRate.toFixed(1)}%</strong></article>
        <article><span>Average score</span><strong>{overallMetrics.average.toFixed(1)}%</strong></article>
      </div>

      <div className="overall-results-breakdown">
        <AssessmentSummary title="Quiz results"
          description="Knowledge and concept assessments"
          metrics={quizMetrics} />
        <AssessmentSummary title="CLI practical results"
          description="Cisco configuration assessments"
          metrics={cliMetrics} />
      </div>

      {message && (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      )}
    </section>
  )
}
