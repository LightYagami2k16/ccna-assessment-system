import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getInstructorCliAttemptReview,
  getInstructorCliResults,
  resetInstructorCliAttempts,
} from '../services/cliLabService'
import BrowserEventReview from './BrowserEventReview'
import ResultActionMenu from './ResultActionMenu'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import LoadingState from './LoadingState'
import {
  ActionBar,
  ResponsiveGrid,
  SectionHeader,
  SurfaceCard,
} from './LayoutPrimitives'

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

function csvCell(value) {
  const text = value == null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function csvDate(value) {
  return value ? new Date(value).toISOString() : ''
}

function allSelected(attemptIds, selectedAttemptIds) {
  return (
    attemptIds.length > 0 &&
    attemptIds.every((attemptId) =>
      selectedAttemptIds.includes(attemptId),
    )
  )
}

function resultLabel(attempt) {
  if (attempt.status === 'in_progress') return 'In progress'
  return attempt.passed ? 'Passed' : 'Failed'
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
        practicals: new Map(),
      })
    }
    const student = classGroup.students.get(studentKey)
    const practicalKey = attempt.labId || attempt.labTitle
    if (!student.practicals.has(practicalKey)) {
      student.practicals.set(practicalKey, {
        id: practicalKey,
        title: attempt.labTitle,
        courseCode: attempt.courseCode,
        moduleCode: attempt.moduleCode,
        deviceType: attempt.deviceType,
        attempts: [],
      })
    }
    student.practicals.get(practicalKey).attempts.push(attempt)
  })
  return [...classes.values()].map((group) => ({
    ...group,
    students: [...group.students.values()].map((student) => ({
      ...student,
      practicals: [...student.practicals.values()],
    })),
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
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [exportClassId, setExportClassId] = useState('all')
  const [courseFilter, setCourseFilter] = useState('all')
  const [practicalFilter, setPracticalFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
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

  const classes = useMemo(
    () =>
      [
        ...new Map(
          attempts.map((attempt) => [
            attempt.classId || 'unassigned',
            attempt.className || 'Unassigned students',
          ]),
        ).entries(),
      ].sort((left, right) => left[1].localeCompare(right[1])),
    [attempts],
  )

  const courses = useMemo(
    () =>
      [
        ...new Set(
          attempts
            .map((attempt) => attempt.courseCode)
            .filter(Boolean),
        ),
      ].sort(),
    [attempts],
  )

  const practicals = useMemo(
    () =>
      [
        ...new Map(
          attempts.map((attempt) => [
            attempt.labId || attempt.labTitle,
            attempt.labTitle,
          ]),
        ).entries(),
      ].sort((left, right) => left[1].localeCompare(right[1])),
    [attempts],
  )

  const exportAttempts = useMemo(
    () =>
      exportClassId === 'all'
        ? attempts
        : attempts.filter(
            (attempt) =>
              (attempt.classId || 'unassigned') ===
              exportClassId,
          ),
    [attempts, exportClassId],
  )

  const filteredAttempts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return attempts.filter((attempt) => {
      const matchesSearch =
        !normalizedSearch ||
        attempt.studentName
          ?.toLowerCase()
          .includes(normalizedSearch) ||
        attempt.studentEmail
          ?.toLowerCase()
          .includes(normalizedSearch) ||
        attempt.labTitle
          ?.toLowerCase()
          .includes(normalizedSearch) ||
        attempt.className
          ?.toLowerCase()
          .includes(normalizedSearch)

      const matchesClass =
        classFilter === 'all' ||
        (attempt.classId || 'unassigned') === classFilter
      const matchesCourse =
        courseFilter === 'all' ||
        attempt.courseCode === courseFilter
      const matchesPractical =
        practicalFilter === 'all' ||
        (attempt.labId || attempt.labTitle) === practicalFilter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'passed' && attempt.passed === true) ||
        (statusFilter === 'failed' && attempt.passed === false) ||
        attempt.status === statusFilter

      return (
        matchesSearch &&
        matchesClass &&
        matchesCourse &&
        matchesPractical &&
        matchesStatus
      )
    })
  }, [
    attempts,
    classFilter,
    courseFilter,
    practicalFilter,
    search,
    statusFilter,
  ])

  const groups = useMemo(
    () => groupResults(filteredAttempts),
    [filteredAttempts],
  )

  const visibleAttemptIds = useMemo(
    () =>
      filteredAttempts.map((attempt) => attempt.attemptId),
    [filteredAttempts],
  )

  const metrics = useMemo(() => {
    const graded = attempts.filter(
      (attempt) => attempt.passed != null,
    )
    const passed = graded.filter((attempt) => attempt.passed)
    const average = graded.length
      ? graded.reduce(
          (sum, attempt) => sum + Number(attempt.percentage),
          0,
        ) / graded.length
      : 0

    return {
      total: attempts.length,
      active: attempts.filter(
        (attempt) => attempt.status === 'in_progress',
      ).length,
      passRate: graded.length
        ? (passed.length / graded.length) * 100
        : 0,
      average,
    }
  }, [attempts])

  function toggleAttempts(attemptIds, checked) {
    setSelectedAttemptIds((current) =>
      checked
        ? [...new Set([...current, ...attemptIds])]
        : current.filter((id) => !attemptIds.includes(id)),
    )
  }

  function handleExportCsv() {
    if (!exportAttempts.length) return

    const headers = [
      'Assessment Type',
      'Class Code',
      'Class Name',
      'Student Name',
      'Student Email',
      'Course',
      'Module',
      'CLI Practical',
      'Device Type',
      'Attempt Number',
      'Status',
      'Raw Score',
      'Maximum Score',
      'Percentage',
      'Commands Entered',
      'Integrity Events',
      'Started At',
      'Submitted At',
    ]

    const rows = exportAttempts.map((attempt) => [
      'CLI Practical',
      attempt.classCode,
      attempt.className,
      attempt.studentName,
      attempt.studentEmail,
      attempt.courseCode,
      attempt.moduleCode,
      attempt.labTitle,
      attempt.deviceType,
      attempt.attemptNumber,
      resultLabel(attempt),
      Number(attempt.scorePoints),
      Number(attempt.maximumPoints),
      Number(attempt.percentage).toFixed(2),
      Number(attempt.commandCount ?? 0),
      Number(attempt.eventCount ?? 0),
      csvDate(attempt.startedAt),
      csvDate(attempt.submittedAt),
    ])

    const csv = [
      headers.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ].join('\r\n')

    const blob = new Blob([`\uFEFF${csv}`], {
      type: 'text/csv;charset=utf-8',
    })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const timestamp = new Date()
      .toISOString()
      .replaceAll(':', '-')
      .replace(/\.\d{3}Z$/, 'Z')
    const selectedClassName =
      exportClassId === 'all'
        ? 'all-classes'
        : classes.find(
            ([classId]) => classId === exportClassId,
          )?.[1] || 'selected-class'
    const safeClassName = selectedClassName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    link.href = downloadUrl
    link.download =
      `ccna-cli-results-${safeClassName}-${timestamp}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(downloadUrl)
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
      <SectionHeader
        className="section-heading"
        eyebrow="CLI PRACTICAL RESULTS"
        title="Student CLI attempts"
        description="Review final scores, integrity events, and every grading requirement."
        actions={<div className="results-heading-actions">
          <div className="results-export-control">
            <label>
              Export class
              <select
                value={exportClassId}
                onChange={(event) =>
                  setExportClassId(event.target.value)
                }
              >
                <option value="all">All classes</option>
                {classes.map(([classId, className]) => (
                  <option key={classId} value={classId}>
                    {className}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              type="button"
              disabled={!exportAttempts.length}
              onClick={handleExportCsv}
            >
              Export CLI CSV
            </button>
          </div>
          <button
            className="secondary"
            type="button"
            onClick={() => void loadResults()}
          >
            Refresh CLI results
          </button>
        </div>}
      />

      <ResponsiveGrid className="results-metrics" min="10rem" aria-label="CLI practical results summary">
        <SurfaceCard as="article" subtle>
          <span>Total attempts</span>
          <strong>{metrics.total}</strong>
        </SurfaceCard>
        <SurfaceCard as="article" subtle>
          <span>Active now</span>
          <strong>{metrics.active}</strong>
        </SurfaceCard>
        <SurfaceCard as="article" subtle>
          <span>Pass rate</span>
          <strong>{metrics.passRate.toFixed(1)}%</strong>
        </SurfaceCard>
        <SurfaceCard as="article" subtle>
          <span>Average score</span>
          <strong>{metrics.average.toFixed(1)}%</strong>
        </SurfaceCard>
      </ResponsiveGrid>

      <ResponsiveGrid className="results-filters results-filters--with-class" min="11rem">
        <label>
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Class, student, email, or practical"
          />
        </label>

        <label>
          Class
          <select
            value={classFilter}
            onChange={(event) =>
              setClassFilter(event.target.value)
            }
          >
            <option value="all">All classes</option>
            {classes.map(([classId, className]) => (
              <option key={classId} value={classId}>
                {className}
              </option>
            ))}
          </select>
        </label>

        <label>
          Course
          <select
            value={courseFilter}
            onChange={(event) =>
              setCourseFilter(event.target.value)
            }
          >
            <option value="all">All courses</option>
            {courses.map((course) => (
              <option key={course} value={course}>
                {course}
              </option>
            ))}
          </select>
        </label>

        <label>
          CLI practical
          <select
            value={practicalFilter}
            onChange={(event) =>
              setPracticalFilter(event.target.value)
            }
          >
            <option value="all">All practicals</option>
            {practicals.map(([practicalId, practicalTitle]) => (
              <option key={practicalId} value={practicalId}>
                {practicalTitle}
              </option>
            ))}
          </select>
        </label>

        <label>
          Result
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
          >
            <option value="all">All results</option>
            <option value="in_progress">In progress</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
          </select>
        </label>
      </ResponsiveGrid>

      {!!visibleAttemptIds.length && (
        <ActionBar className="bulk-action-bar">
          <label className="bulk-select-control">
            <input
              type="checkbox"
              checked={allSelected(
                visibleAttemptIds,
                selectedAttemptIds,
              )}
              onChange={(event) =>
                toggleAttempts(
                  visibleAttemptIds,
                  event.target.checked,
                )
              }
            />
            Select all filtered CLI attempts
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
        </ActionBar>
      )}

      {loading ? (
        <LoadingState label="Loading CLI results..." />
      ) : !attempts.length ? (
        <div className="empty-state">
          <h3>No CLI attempts</h3>
          <p>
            CLI attempts will appear after a student starts a
            practical.
          </p>
        </div>
      ) : !filteredAttempts.length ? (
        <div className="empty-state">
          <h3>No matching CLI attempts</h3>
          <p>Adjust the filters to show more records.</p>
        </div>
      ) : (
        <div className="cli-result-class-groups">
          <p className="student-result-groups__summary">
            Showing {groups.length}{' '}
            {groups.length === 1 ? 'class' : 'classes'},{' '}
            {groups.reduce(
              (total, classGroup) =>
                total + classGroup.students.length,
              0,
            )}{' '}
            students, and {filteredAttempts.length} attempts.
          </p>

          {groups.map((classGroup) => {
            const classAttemptIds = classGroup.students.flatMap(
              (student) =>
                student.practicals.flatMap((practical) =>
                  practical.attempts.map(
                    (attempt) => attempt.attemptId,
                  ),
                ),
            )
            const classExpanded = expandedClasses.includes(classGroup.id)
            const classPanelId = `cli-result-class-${classGroup.id}`
            return (
              <section className="class-result-group" key={classGroup.id}>
                <header className="class-result-group__header">
                  <label className="bulk-select-control">
                    <input
                      type="checkbox"
                      checked={allSelected(
                        classAttemptIds,
                        selectedAttemptIds,
                      )}
                      onChange={(event) =>
                        toggleAttempts(
                          classAttemptIds,
                          event.target.checked,
                        )
                      }
                    />
                    <span>
                      <span className="eyebrow">{classGroup.code}</span>
                      <strong>{classGroup.name}</strong>
                      <small>CLI practical results</small>
                    </span>
                  </label>
                  <div className="result-group__controls">
                    <span className="status-chip">
                      {classGroup.students.length}{' '}
                      {classGroup.students.length === 1
                        ? 'student'
                        : 'students'}
                    </span>
                    <button
                      className="result-collapse-button"
                      type="button"
                      aria-expanded={classExpanded}
                      aria-controls={classPanelId}
                      onClick={() => setExpandedClasses((current) =>
                        current.includes(classGroup.id) ? current.filter((id) => id !== classGroup.id) : [...current, classGroup.id]
                      )}
                    >
                      {classExpanded ? 'Hide students' : 'Show students'}
                    </button>
                  </div>
                </header>
                {classExpanded && (
                  <div
                    className="class-result-group__students"
                    id={classPanelId}
                  >
                    {classGroup.students.map((student) => {
                      const studentKey = `${classGroup.id}:${student.id}`
                      const studentAttemptIds =
                        student.practicals.flatMap((practical) =>
                          practical.attempts.map(
                            (attempt) => attempt.attemptId,
                          ),
                        )
                      const studentExpanded =
                        expandedStudents.includes(studentKey)
                      const studentPanelId = `cli-result-student-${studentKey}`
                      return (
                        <article className="student-result-group" key={studentKey}>
                          <header className="student-result-group__header">
                            <label className="bulk-select-control student-result-group__identity">
                              <input
                                type="checkbox"
                                checked={allSelected(
                                  studentAttemptIds,
                                  selectedAttemptIds,
                                )}
                                onChange={(event) =>
                                  toggleAttempts(
                                    studentAttemptIds,
                                    event.target.checked,
                                  )
                                }
                              />
                              <span
                                className="student-result-group__avatar"
                                aria-hidden="true"
                              >
                                {student.name.charAt(0).toUpperCase()}
                              </span>
                              <span>
                                <strong>{student.name}</strong>
                                <small>{student.email}</small>
                              </span>
                            </label>
                            <div className="result-group__controls">
                              <span className="student-result-group__count">
                                {studentAttemptIds.length}{' '}
                                {studentAttemptIds.length === 1
                                  ? 'attempt'
                                  : 'attempts'}
                              </span>
                              <button
                                className="module-collapse-button"
                                type="button"
                                aria-expanded={studentExpanded}
                                aria-controls={studentPanelId}
                                onClick={() => setExpandedStudents((current) =>
                                  current.includes(studentKey) ? current.filter((id) => id !== studentKey) : [...current, studentKey]
                                )}
                              >
                                {studentExpanded
                                  ? 'Hide records'
                                  : 'Show records'}
                              </button>
                            </div>
                          </header>
                          {studentExpanded && (
                            <div
                              className="student-result-group__quizzes"
                              id={studentPanelId}
                            >
                              {student.practicals.map((practical) => {
                                const practicalAttemptIds =
                                  practical.attempts.map(
                                    (attempt) => attempt.attemptId,
                                  )

                                return (
                                  <section
                                    className="student-quiz-result-group"
                                    key={practical.id}
                                  >
                                    <header className="student-quiz-result-group__header">
                                      <label className="bulk-select-control">
                                        <input
                                          type="checkbox"
                                          checked={allSelected(
                                            practicalAttemptIds,
                                            selectedAttemptIds,
                                          )}
                                          onChange={(event) =>
                                            toggleAttempts(
                                              practicalAttemptIds,
                                              event.target.checked,
                                            )
                                          }
                                        />
                                        <span>
                                          <strong>{practical.title}</strong>
                                          <small>
                                            {practical.courseCode}
                                            {practical.moduleCode
                                              ? ` · ${practical.moduleCode}`
                                              : ''}
                                            {practical.deviceType
                                              ? ` · ${practical.deviceType}`
                                              : ''}
                                          </small>
                                        </span>
                                      </label>
                                      <span className="status-chip">
                                        {practical.attempts.length}{' '}
                                        {practical.attempts.length === 1
                                          ? 'attempt'
                                          : 'attempts'}
                                      </span>
                                    </header>

                                    <div
                                      className="results-table-wrapper"
                                      role="region"
                                      aria-label={`${student.name} ${practical.title} CLI attempt table`}
                                      tabIndex="0"
                                    >
                                      <table className="results-table results-table--attempts">
                                        <thead>
                                          <tr>
                                            <th>Select</th>
                                            <th>Attempt</th>
                                            <th>Commands</th>
                                            <th>Score</th>
                                            <th>Events</th>
                                            <th>Result</th>
                                            <th>Started</th>
                                            <th>Submitted</th>
                                            <th>Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                  {practical.attempts.map((attempt) => (
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
                                      <td className="results-table__centered">
                                        <strong>#{attempt.attemptNumber}</strong>
                                      </td>
                                      <td className="results-table__centered">
                                        <strong>
                                          {Number(attempt.commandCount ?? 0)}
                                        </strong>
                                        <small>commands entered</small>
                                      </td>
                                      <td className="results-table__score">
                                        <strong>
                                          {Number(attempt.scorePoints)} /{' '}
                                          {Number(attempt.maximumPoints)}
                                        </strong>
                                        <small>
                                          (
                                          {Number(
                                            attempt.percentage,
                                          ).toFixed(2)}
                                          %)
                                        </small>
                                      </td>
                                      <td className="results-table__centered">
                                        <span
                                          className={
                                            Number(
                                              attempt.eventCount ?? 0,
                                            ) > 0
                                              ? 'result-event-count result-event-count--flagged'
                                              : 'result-event-count'
                                          }
                                        >
                                          {Number(attempt.eventCount ?? 0)}
                                        </span>
                                      </td>
                                      <td className="results-table__centered">
                                        <span
                                          className={[
                                            'result-status',
                                            attempt.status === 'in_progress'
                                              ? 'result-status--active'
                                              : attempt.passed
                                                ? 'result-status--passed'
                                                : 'result-status--failed',
                                          ].join(' ')}
                                        >
                                          {resultLabel(attempt)}
                                        </span>
                                      </td>
                                      <td className="results-table__date">
                                        {formatDate(attempt.startedAt)}
                                      </td>
                                      <td className="results-table__date">
                                        {formatDate(attempt.submittedAt)}
                                      </td>
                                      <td className="results-table__action">
                                        <ResultActionMenu
                                          ariaLabel={`Actions for CLI attempt ${attempt.attemptNumber} of ${practical.title}`}
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
                                                `attempt #${attempt.attemptNumber} for ${practical.title}`,
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
                          </section>
                        )
                      })}
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
