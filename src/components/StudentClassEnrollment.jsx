import { useCallback, useEffect, useRef, useState } from 'react'
import DataLoadBoundary from './DataLoadBoundary'
import useStudentPageRefresh from '../hooks/useStudentPageRefresh'
import useDataLoadState from '../hooks/useDataLoadState'
import {
  getStudentClassEnrollment,
  requestClassJoin,
} from '../services/assignmentService'

function getClassCodeFromUrl() {
  const pageParameters = new URLSearchParams(window.location.search)
  const directCode = pageParameters.get('classCode')

  if (directCode) return directCode.toUpperCase()

  const hashQuery = window.location.hash.split('?')[1] ?? ''
  return new URLSearchParams(hashQuery).get('classCode')?.toUpperCase() ?? ''
}

export default function StudentClassEnrollment({ onEnrollmentChanged }) {
  const [joinCode, setJoinCode] = useState(getClassCodeFromUrl)
  const [enrollment, setEnrollment] = useState({
    classes: [],
    requests: [],
  })
  const [loading, setLoading, hasLoaded, markLoaded] = useDataLoadState()
  const initialized = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [loadMessage, setLoadMessage] = useState('')
  const [expanded, setExpanded] = useState(false)

  const loadEnrollment = useCallback(async () => {
    try {
      setLoading(true)
      setLoadMessage('')
      const data = await getStudentClassEnrollment()
      setEnrollment(data)
      if (!initialized.current) {
        if (!data.classes.length) setExpanded(true)
        initialized.current = true
      }
      markLoaded()
    } catch (error) {
      setLoadMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [markLoaded, setLoading])

  useEffect(() => {
    void loadEnrollment()
  }, [loadEnrollment])

  useStudentPageRefresh(loadEnrollment, { enabled: !loading && !submitting, intervalMs: 30000 })

  async function handleJoin(event) {
    event.preventDefault()
    const normalizedCode = joinCode.trim().toUpperCase()

    if (!/^[A-Z0-9]{8}$/.test(normalizedCode)) {
      setMessage('Enter the 8-character class code from your instructor.')
      return
    }

    setSubmitting(true)
    setMessage('')
    try {
      const result = await requestClassJoin(normalizedCode)
      setJoinCode('')
      setMessage(
        `Your request to join ${result.className} was sent for instructor approval.`,
      )
      await loadEnrollment()
      await onEnrollmentChanged?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section
      className={[
        'student-class-enrollment',
        expanded ? 'student-class-enrollment--expanded' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">CLASS ENROLLMENT</span>
          <h2>
            {!hasLoaded
              ? 'Class enrollment'
              : enrollment.classes.length
                ? 'My class enrollment'
                : 'Join your class'}
          </h2>
          <p>
            {!hasLoaded
              ? 'View your classes or use a class code from your instructor.'
              : enrollment.classes.length
                ? 'View your classes or use another class code.'
                : 'Enter the class code from your instructor. Assessments become available after approval.'}
          </p>
        </div>
        <div className="student-enrollment-heading__actions">
          <span className="status-chip">
            {hasLoaded ? enrollment.classes.length : '\u2014'} enrolled
          </span>
          <button
            className="secondary"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Hide enrollment' : 'Manage enrollment'}
          </button>
        </div>
      </div>

      {message && (
        <p className="form-message" role="status" aria-live="polite">
          {message}
        </p>
      )}
          {loadMessage && <p className="form-message form-message--error" role="alert">{loadMessage}</p>}
      <DataLoadBoundary loading={loading} ready={hasLoaded} error={Boolean(loadMessage)} onRetry={loadEnrollment} label="Loading class enrollment...">
        {expanded && (
          <div className="student-enrollment-content">
            <form className="student-join-form" onSubmit={handleJoin}>
              <label>
                Class code
                <input
                  value={joinCode}
                  maxLength="8"
                  autoCapitalize="characters"
                  onChange={(event) =>
                    setJoinCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, ''),
                    )
                  }
                  placeholder="Example: A4C8D2F1"
                />
              </label>
              <button className="primary" type="submit" disabled={submitting}>
                {submitting ? 'Sending request...' : 'Request to join'}
              </button>
            </form>

            <div className="student-enrollment-summary">
              <section>
                <h3>My classes</h3>
                {!enrollment.classes.length ? (
                  <p className="muted-copy">
                    You are not enrolled in a class yet.
                  </p>
                ) : (
                  <div className="student-class-list">
                    {enrollment.classes.map((classSection) => (
                      <article key={classSection.id}>
                        <span className="course-code">{classSection.code}</span>
                        <strong>{classSection.name}</strong>
                        <small>
                          {classSection.academicTerm || 'No academic term'}
                        </small>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3>Enrollment requests</h3>
                {!enrollment.requests.length ? (
                  <p className="muted-copy">No enrollment requests.</p>
                ) : (
                  <div className="student-request-list">
                    {enrollment.requests.map((request) => (
                      <article key={request.id}>
                        <div>
                          <strong>{request.className}</strong>
                          <small>{request.classCode}</small>
                        </div>
                        <span
                          className={`content-status content-status--${
                            request.status === 'pending' ? 'draft' : 'archived'
                          }`}
                        >
                          {request.status}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </DataLoadBoundary>
    </section>
  )
}
