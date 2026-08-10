import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getApplicationHealthSummary,
  setApplicationErrorsResolved,
} from '../services/operationalMonitoringService'

const checkLabels = {
  database: 'Database connection',
  quizEngine: 'Quiz attempt engine',
  cliEngine: 'CLI practical engine',
  contentBackup: 'Content backup service',
  errorReporting: 'Runtime error reporting',
}

const previewSummary = {
  status: 'operational',
  checkedAt: new Date().toISOString(),
  checks: Object.fromEntries(
    Object.keys(checkLabels).map((key) => [key, true]),
  ),
  counts: { last24Hours: 0, last7Days: 0, unresolved: 0 },
  topErrors: [],
  recentEvents: [],
}

function formatDate(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

export default function AdminSystemHealth({ previewMode = false }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)
  const [message, setMessage] = useState('')

  const loadSummary = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (!quiet) setLoading(true)
      setMessage('')
      setSummary(
        previewMode
          ? { ...previewSummary, checkedAt: new Date().toISOString() }
          : await getApplicationHealthSummary(),
      )
    } catch (error) {
      setMessage(error?.message ?? 'Unable to load system health.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [previewMode])

  useEffect(() => {
    void loadSummary()
    const intervalId = window.setInterval(
      () => void loadSummary({ quiet: true }),
      60_000,
    )
    return () => window.clearInterval(intervalId)
  }, [loadSummary])

  const checkMetrics = useMemo(() => {
    const values = Object.values(summary?.checks ?? {})
    return {
      passed: values.filter(Boolean).length,
      total: values.length,
    }
  }, [summary?.checks])

  async function toggleResolved(event) {
    try {
      setUpdatingId(event.id)
      setMessage('')
      await setApplicationErrorsResolved(
        [event.id],
        !event.resolvedAt,
        event.resolvedAt ? null : 'Reviewed by an administrator.',
      )
      await loadSummary({ quiet: true })
    } catch (error) {
      setMessage(error?.message ?? 'Unable to update this error event.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <section className="admin-health-panel">
      <header className="section-heading">
        <div>
          <span className="eyebrow">OPERATIONAL MONITORING</span>
          <h2>System health</h2>
          <p>
            Confirm critical backend services are available and review
            privacy-safe application error categories.
          </p>
        </div>
        <button
          className="secondary"
          type="button"
          disabled={loading}
          onClick={() => void loadSummary()}
        >
          {loading ? 'Checking...' : 'Refresh health'}
        </button>
      </header>

      {message && (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      )}

      {loading && !summary ? (
        <div className="admin-users-empty">
          <strong>Checking system health...</strong>
          <span>This normally takes only a moment.</span>
        </div>
      ) : summary ? (
        <>
          <div className="admin-health-metrics" aria-label="System health summary">
            <article>
              <span>Backend checks</span>
              <strong>{checkMetrics.passed} / {checkMetrics.total}</strong>
            </article>
            <article>
              <span>Errors in 24 hours</span>
              <strong>{summary.counts?.last24Hours ?? 0}</strong>
            </article>
            <article>
              <span>Errors in 7 days</span>
              <strong>{summary.counts?.last7Days ?? 0}</strong>
            </article>
            <article>
              <span>Needs review</span>
              <strong>{summary.counts?.unresolved ?? 0}</strong>
            </article>
          </div>

          <div className="admin-health-grid">
            <section className="admin-health-checks">
              <div className="admin-health-section-title">
                <div>
                  <h3>Service readiness</h3>
                  <p>Last checked {formatDate(summary.checkedAt)}</p>
                </div>
                <span className={
                  checkMetrics.passed === checkMetrics.total
                    ? 'status-badge status-badge--success'
                    : 'status-badge status-badge--danger'
                }>
                  {checkMetrics.passed === checkMetrics.total
                    ? 'Operational'
                    : 'Attention required'}
                </span>
              </div>
              <ul>
                {Object.entries(checkLabels).map(([key, label]) => {
                  const passed = Boolean(summary.checks?.[key])
                  return (
                    <li key={key}>
                      <span>{label}</span>
                      <strong className={passed ? 'health-pass' : 'health-fail'}>
                        {passed ? 'Available' : 'Unavailable'}
                      </strong>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="admin-health-recurring">
              <h3>Recurring categories</h3>
              <p>Most frequent privacy-safe error categories from the last 7 days.</p>
              {!summary.topErrors?.length ? (
                <div className="admin-health-empty">No recurring errors recorded.</div>
              ) : (
                <ul>
                  {summary.topErrors.map((item) => (
                    <li key={item.fingerprint}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.message}</small>
                      </span>
                      <strong>{item.occurrences}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="admin-health-events">
            <div>
              <h3>Recent error events</h3>
              <p>Raw exception messages, stack traces, URLs, and form data are not collected.</p>
            </div>
            {!summary.recentEvents?.length ? (
              <div className="admin-health-empty">No application errors recorded.</div>
            ) : (
              <div className="admin-health-event-list">
                {summary.recentEvents.map((event) => (
                  <article key={event.id}>
                    <div>
                      <strong>{event.name}: {event.message}</strong>
                      <span>{event.component} · {formatDate(event.occurredAt)}</span>
                    </div>
                    <span className={
                      event.resolvedAt
                        ? 'status-badge status-badge--success'
                        : 'status-badge status-badge--warning'
                    }>
                      {event.resolvedAt ? 'Resolved' : 'Needs review'}
                    </span>
                    <button
                      className="secondary"
                      type="button"
                      disabled={updatingId === event.id || previewMode}
                      onClick={() => void toggleResolved(event)}
                    >
                      {updatingId === event.id
                        ? 'Saving...'
                        : event.resolvedAt ? 'Reopen' : 'Resolve'}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  )
}
