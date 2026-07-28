import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getInstructorCliAttemptReview,
  getInstructorCliResults,
  resetInstructorCliAttempts,
} from '../services/cliLabService'
import BrowserEventReview from './BrowserEventReview'
import ResultActionMenu from './ResultActionMenu'
import useConfirmationDialog from '../hooks/useConfirmationDialog'

const criterionLabels = {
  hostname: 'Hostname',
  vlan_exists: 'VLAN exists',
  vlan_name: 'VLAN name',
  interface_mode: 'Interface switchport mode',
  interface_access_vlan: 'Interface access VLAN',
  interface_enabled: 'Interface enabled',
  interface_ip: 'Interface IP address',
  ip_routing_enabled: 'Layer 3 IP routing enabled',
  default_gateway: 'Switch default gateway',
  static_route: 'Static route',
  default_route: 'Default route',
  ospf_process: 'OSPF process exists',
  ospf_router_id: 'OSPF router ID',
  ospf_network: 'OSPF network statement',
  ospf_passive_interface: 'OSPF passive interface',
  ospf_default_information: 'OSPF default information originate',
  acl_exists: 'Access list exists',
  acl_entry: 'Access list entry',
  interface_acl: 'Interface access list',
  config_saved: 'Configuration saved',
}

function formatDate(value) {
  if (!value) return 'Not submitted'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function groupResults(attempts) {
  const classes = new Map()
  attempts.forEach((attempt) => {
    const classKey = attempt.classId || 'unassigned'
    if (!classes.has(classKey)) {
      classes.set(classKey, {
        id: classKey,
        code: attempt.classCode || 'NO CLASS',
        name: attempt.className || 'Unassigned students',
        students: new Map(),
      })
    }
    const classGroup = classes.get(classKey)
    const studentKey = attempt.studentId || attempt.studentEmail
    if (!classGroup.students.has(studentKey)) {
      classGroup.students.set(studentKey, {
        id: studentKey,
        name: attempt.studentName || 'Unnamed student',
        email: attempt.studentEmail,
        attempts: [],
      })
    }
    classGroup.students.get(studentKey).attempts.push(attempt)
  })
  return [...classes.values()].map((group) => ({
    ...group,
    students: [...group.students.values()],
  }))
}

function CliAttemptReview({ attemptId, onBack }) {
  const [review, setReview] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    getInstructorCliAttemptReview(attemptId)
      .then((data) => { if (active) setReview(data) })
      .catch((error) => { if (active) setMessage(error.message) })
    return () => { active = false }
  }, [attemptId])

  if (!review) {
    return (
      <section className="cli-results-panel">
        <button className="secondary" type="button" onClick={onBack}>Back to CLI results</button>
        <p>{message || 'Loading CLI attempt review...'}</p>
      </section>
    )
  }

  return (
    <section className="cli-results-panel cli-attempt-review">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CLI ATTEMPT REVIEW</span>
          <h2>{review.attempt.studentName}</h2>
          <p>{review.attempt.labTitle} · Attempt #{review.attempt.attemptNumber}</p>
        </div>
        <button className="secondary" type="button" onClick={onBack}>Back to results</button>
      </div>

      <div className="cli-review-summary">
        <article><span>Raw score</span><strong>{Number(review.attempt.scorePoints)} / {Number(review.attempt.maximumPoints)}</strong></article>
        <article><span>Percentage</span><strong>{Number(review.attempt.percentage).toFixed(2)}%</strong></article>
        <article><span>Result</span><strong>{review.attempt.passed ? 'Passed' : 'Failed'}</strong></article>
        <article><span>Commands</span><strong>{review.commands.length}</strong></article>
      </div>

      <h3>Grading criteria</h3>
      <div className="cli-criterion-review-list">
        {review.criteria.map((criterion, index) => (
          <article className={criterion.met ? 'cli-criterion-review cli-criterion-review--correct' : 'cli-criterion-review cli-criterion-review--incorrect'}
            key={`${criterion.type}-${criterion.target}-${index}`}>
            <span className="cli-criterion-review__mark">{criterion.met ? '✓' : '✕'}</span>
            <div>
              <strong>{criterionLabels[criterion.type] || criterion.type}</strong>
              <p>
                {criterion.target ? `Target: ${criterion.target}. ` : ''}
                {criterion.expected ? `Expected: ${criterion.expected}.` : ''}
              </p>
            </div>
            <span>{Number(criterion.pointsAwarded)} / {Number(criterion.points)} points</span>
          </article>
        ))}
      </div>

      <h3>Command log</h3>
      <div className="cli-command-review">
        {review.commands.map((command) => (
          <div key={command.sequence}>
            <span>#{command.sequence}</span>
            <code>{command.command}</code>
            <span className={command.accepted ? 'command-valid' : 'command-invalid'}>
              {command.accepted ? 'Accepted' : 'Invalid'}
            </span>
            {command.output && <pre>{command.output}</pre>}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function InstructorCliResults() {
  const [attempts, setAttempts] = useState([])
  const [selectedAttemptId, setSelectedAttemptId] = useState(null)
  const [browserEventAttemptId, setBrowserEventAttemptId] = useState(null)
  const [expandedClasses, setExpandedClasses] = useState([])
  const [expandedStudents, setExpandedStudents] = useState([])
  const [selectedAttemptIds, setSelectedAttemptIds] = useState([])
  const [resetting, setResetting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('error')
  const { confirm, confirmationDialog } = useConfirmationDialog()

  const loadResults = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getInstructorCliResults()
      setAttempts(data)
      setSelectedAttemptIds((current) =>
        current.filter((attemptId) =>
          data.some((attempt) => attempt.attemptId === attemptId),
        ),
      )
      setMessage('')
    } catch (error) {
      setMessageTone('error')
      setMessage(
        `${error.message} Run migration 022_cli_history_and_results.sql if needed.`,
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadResults() }, [loadResults])
  const groups = useMemo(() => groupResults(attempts), [attempts])

  function toggleAttempts(attemptIds, checked) {
    setSelectedAttemptIds((current) =>
      checked
        ? [...new Set([...current, ...attemptIds])]
        : current.filter((id) => !attemptIds.includes(id)),
    )
  }

  async function handleReset(attemptIds, description) {
    if (!attemptIds.length) return
    const confirmed = await confirm({
      title: `Reset ${description}?`,
      message:
        'This removes the CLI score, command log, integrity events, and student history. The student can take the practical again. This action cannot be undone.',
      confirmLabel: 'Reset attempts',
      tone: 'danger',
    })
    if (!confirmed) return

    setResetting(true)
    setMessage('')
    try {
      const count = await resetInstructorCliAttempts(attemptIds)
      setSelectedAttemptIds((current) =>
        current.filter((id) => !attemptIds.includes(id)),
      )
      await loadResults()
      setMessageTone('success')
      setMessage(
        `${count} CLI ${Number(count) === 1 ? 'attempt was' : 'attempts were'} reset.`,
      )
    } catch (error) {
      setMessageTone('error')
      setMessage(error.message)
    } finally {
      setResetting(false)
    }
  }

  if (browserEventAttemptId) {
    return (
      <BrowserEventReview
        attemptId={browserEventAttemptId}
        attemptType="cli"
        onBack={() => setBrowserEventAttemptId(null)}
      />
    )
  }

  if (selectedAttemptId) {
    return <CliAttemptReview attemptId={selectedAttemptId} onBack={() => setSelectedAttemptId(null)} />
  }

  return (
    <section className="cli-results-panel">
      {confirmationDialog}
      <div className="section-heading">
        <div>
          <span className="eyebrow">CLI PRACTICAL RESULTS</span>
          <h2>Student CLI attempts</h2>
          <p>Review final scores, integrity events, and every grading requirement.</p>
        </div>
        <button className="secondary" type="button" onClick={() => void loadResults()}>Refresh CLI results</button>
      </div>

      {!!attempts.length && (
        <div className="bulk-action-bar">
          <label className="bulk-select-control">
            <input
              type="checkbox"
              checked={attempts.every((attempt) =>
                selectedAttemptIds.includes(attempt.attemptId),
              )}
              onChange={(event) =>
                toggleAttempts(
                  attempts.map((attempt) => attempt.attemptId),
                  event.target.checked,
                )
              }
            />
            Select all CLI attempts
          </label>
          <div className="bulk-action-bar__actions">
            <span>{selectedAttemptIds.length} selected</span>
            <button
              className="danger-button"
              type="button"
              disabled={!selectedAttemptIds.length || resetting}
              onClick={() =>
                void handleReset(
                  selectedAttemptIds,
                  `${selectedAttemptIds.length} selected ${
                    selectedAttemptIds.length === 1
                      ? 'CLI attempt'
                      : 'CLI attempts'
                  }`,
                )
              }
            >
              {resetting ? 'Resetting...' : 'Reset selected'}
            </button>
          </div>
        </div>
      )}

      {loading ? <p>Loading CLI results...</p> : !attempts.length ? (
        <div className="empty-state"><h3>No CLI attempts</h3><p>CLI attempts will appear after a student starts a practical.</p></div>
      ) : (
        <div className="cli-result-class-groups">
          {groups.map((classGroup) => {
            const classExpanded = expandedClasses.includes(classGroup.id)
            return (
              <section className="class-result-group" key={classGroup.id}>
                <header className="class-result-group__header">
                  <div><span className="eyebrow">{classGroup.code}</span><strong>{classGroup.name}</strong></div>
                  <div className="result-group__controls">
                    <span className="status-chip">{classGroup.students.length} students</span>
                    <button className="result-collapse-button" type="button"
                      onClick={() => setExpandedClasses((current) =>
                        current.includes(classGroup.id) ? current.filter((id) => id !== classGroup.id) : [...current, classGroup.id]
                      )}>{classExpanded ? 'Hide students' : 'Show students'}</button>
                  </div>
                </header>
                {classExpanded && (
                  <div className="class-result-group__students">
                    {classGroup.students.map((student) => {
                      const studentKey = `${classGroup.id}:${student.id}`
                      const expanded = expandedStudents.includes(studentKey)
                      return (
                        <article className="student-result-group" key={studentKey}>
                          <header className="student-result-group__header">
                            <div className="student-result-group__identity">
                              <span className="student-result-group__avatar">{student.name.charAt(0).toUpperCase()}</span>
                              <span><strong>{student.name}</strong><small>{student.email}</small></span>
                            </div>
                            <div className="result-group__controls">
                              <span className="student-result-group__count">{student.attempts.length} attempts</span>
                              <button className="module-collapse-button" type="button"
                                onClick={() => setExpandedStudents((current) =>
                                  current.includes(studentKey) ? current.filter((id) => id !== studentKey) : [...current, studentKey]
                                )}>{expanded ? 'Hide records' : 'Show records'}</button>
                            </div>
                          </header>
                          {expanded && (
                            <div
                              className="cli-results-table-wrapper"
                              role="region"
                              aria-label={`${student.name} CLI practical attempt table`}
                              tabIndex="0"
                            >
                              <table className="cli-results-table">
                                <thead><tr><th>Select</th><th>Practical</th><th>Attempt</th><th>Score</th><th>Events</th><th>Commands</th><th>Submitted</th><th>Actions</th></tr></thead>
                                <tbody>
                                  {student.attempts.map((attempt) => (
                                    <tr key={attempt.attemptId}>
                                      <td className="results-table__select">
                                        <input
                                          type="checkbox"
                                          aria-label={`Select CLI attempt ${attempt.attemptNumber} for ${attempt.labTitle}`}
                                          checked={selectedAttemptIds.includes(attempt.attemptId)}
                                          onChange={(event) =>
                                            toggleAttempts(
                                              [attempt.attemptId],
                                              event.target.checked,
                                            )
                                          }
                                        />
                                      </td>
                                      <td><strong>{attempt.labTitle}</strong><small>{attempt.courseCode} · {attempt.deviceType}</small></td>
                                      <td>#{attempt.attemptNumber}</td>
                                      <td><strong>{Number(attempt.scorePoints)} / {Number(attempt.maximumPoints)}</strong><small>({Number(attempt.percentage).toFixed(2)}%)</small></td>
                                      <td>{attempt.eventCount}</td>
                                      <td>{attempt.commandCount}</td>
                                      <td>{formatDate(attempt.submittedAt)}</td>
                                      <td>
                                        <ResultActionMenu
                                          ariaLabel={`Actions for CLI attempt ${attempt.attemptNumber} of ${attempt.labTitle}`}
                                          options={[
                                            {
                                              value: 'review',
                                              label: 'Review grading',
                                            },
                                            {
                                              value: 'events',
                                              label: 'Browser events',
                                            },
                                            {
                                              value: 'reset',
                                              label: 'Reset attempt',
                                            },
                                          ]}
                                          disabledActions={
                                            resetting ? ['reset'] : []
                                          }
                                          onAction={(action) => {
                                            if (action === 'review') {
                                              setSelectedAttemptId(attempt.attemptId)
                                              return undefined
                                            }
                                            if (action === 'events') {
                                              setBrowserEventAttemptId(attempt.attemptId)
                                              return undefined
                                            }
                                            if (action === 'reset') {
                                              return handleReset(
                                                [attempt.attemptId],
                                                `attempt #${attempt.attemptNumber} for ${attempt.labTitle}`,
                                              )
                                            }
                                            return undefined
                                          }}
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
      {message && (
        <p
          className={
            messageTone === 'error'
              ? 'form-message form-message--error'
              : 'form-message form-message--success'
          }
        >
          {message}
        </p>
      )}
    </section>
  )
}
