import useDataLoadState from '../hooks/useDataLoadState'
import DataLoadBoundary from './DataLoadBoundary'
import RefreshButton from './RefreshButton'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteStudentQuizAccommodation,
  getExamControlsWorkspace,
  grantStudentExtraAttempt,
  saveAssessmentIntegrityPolicy,
  saveQuizAssignmentSchedule,
  saveStudentQuizAccommodation,
} from '../services/examControlService'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import useInstructorSubsection from '../hooks/useInstructorSubsection'
import WorkspaceSubsectionNav from './WorkspaceSubsectionNav'
import LiveAttemptMonitor from './LiveAttemptMonitor'
import {
  ActionBar,
  ResponsiveGrid,
  SectionHeader,
  SurfaceCard,
} from './LayoutPrimitives'

const courseTitles = {
  ITN: 'Introduction to Networks',
  SRWE: 'Switching, Routing, and Wireless Essentials',
  ENSA: 'Enterprise Networking, Security, and Automation',
  OTHER: 'Other assessments',
}

const courseOrder = { ITN: 1, SRWE: 2, ENSA: 3, OTHER: 99 }

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null
}

function formatDate(value) {
  if (!value) return 'No limit'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function AssignmentScheduleCard({ assignment, onSaved }) {
  const [availableFrom, setAvailableFrom] = useState(
    toLocalDateTime(assignment.availableFrom),
  )
  const [availableUntil, setAvailableUntil] = useState(
    toLocalDateTime(assignment.availableUntil),
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      await saveQuizAssignmentSchedule({
        quizId: assignment.quizId,
        classId: assignment.classId,
        availableFrom: toIso(availableFrom),
        availableUntil: toIso(availableUntil),
      })
      setMessage('Class schedule saved.')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SurfaceCard as="article" subtle className="schedule-card">
      <span className="course-code">QUIZ SCHEDULE</span>
      <h3>{assignment.quizTitle}</h3>
      <label>
        Opens
        <input
          type="datetime-local"
          value={availableFrom}
          onChange={(event) => setAvailableFrom(event.target.value)}
        />
      </label>
      <label>
        Closes
        <input
          type="datetime-local"
          value={availableUntil}
          onChange={(event) => setAvailableUntil(event.target.value)}
        />
      </label>
      <button className="primary" type="button" disabled={saving} onClick={() => void handleSave()}>
        {saving ? 'Saving...' : 'Save schedule'}
      </button>
      {message && <p className="form-message">{message}</p>}
    </SurfaceCard>
  )
}

function AccommodationEditor({ students, quizzes, onSaved }) {
  const [studentId, setStudentId] = useState('')
  const [quizId, setQuizId] = useState('')
  const [extraTimeMinutes, setExtraTimeMinutes] = useState(0)
  const [extraAttempts, setExtraAttempts] = useState(0)
  const [availableFrom, setAvailableFrom] = useState('')
  const [availableUntil, setAvailableUntil] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!studentId || !quizId) {
      setMessage('Select a student and quiz.')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      await saveStudentQuizAccommodation({
        studentId,
        quizId,
        extraTimeMinutes: Number(extraTimeMinutes),
        extraAttempts: Number(extraAttempts),
        availableFrom: toIso(availableFrom),
        availableUntil: toIso(availableUntil),
      })
      setMessage('Student accommodation saved.')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="accommodation-editor" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          Student
          <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            <option value="">Select student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.fullName || student.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quiz
          <select value={quizId} onChange={(event) => setQuizId(event.target.value)}>
            <option value="">Select quiz</option>
            {quizzes.map((quiz) => (
              <option key={quiz.id} value={quiz.id}>
                {quiz.courseCode} - {quiz.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-grid form-grid--three">
        <label>
          Extra time (minutes)
          <input
            type="number"
            min="0"
            max="480"
            value={extraTimeMinutes}
            onChange={(event) => setExtraTimeMinutes(event.target.value)}
          />
        </label>
        <label>
          Extra attempts
          <input
            type="number"
            min="0"
            max="20"
            value={extraAttempts}
            onChange={(event) => setExtraAttempts(event.target.value)}
          />
        </label>
        <div className="accommodation-note">
          These values are added to the quiz’s normal duration and attempt limit.
        </div>
      </div>
      <div className="form-grid">
        <label>
          Individual opening override
          <input
            type="datetime-local"
            value={availableFrom}
            onChange={(event) => setAvailableFrom(event.target.value)}
          />
        </label>
        <label>
          Individual closing override
          <input
            type="datetime-local"
            value={availableUntil}
            onChange={(event) => setAvailableUntil(event.target.value)}
          />
        </label>
      </div>
      <button className="primary" type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save accommodation'}
      </button>
      {message && <p className="form-message">{message}</p>}
    </form>
  )
}

function IntegrityPolicyEditor({ policies, available, onSaved }) {
  const [selection, setSelection] = useState('')
  const [behavior, setBehavior] = useState('warn')
  const [incidentLimit, setIncidentLimit] = useState(3)
  const [maxHiddenSeconds, setMaxHiddenSeconds] = useState(60)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const selectedPolicy = policies.find((policy) =>
    `${policy.assessmentType}:${policy.assessmentId}` === selection,
  )
  const savedBehavior = selectedPolicy?.behavior ?? 'warn'
  const savedIncidentLimit = selectedPolicy?.incidentLimit ?? 3
  const savedMaxHiddenSeconds = selectedPolicy?.maxHiddenSeconds ?? 60

  useEffect(() => {
    if (!selection && policies.length) {
      const first = policies[0]
      setSelection(`${first.assessmentType}:${first.assessmentId}`)
    }
  }, [policies, selection])

  useEffect(() => {
    setBehavior(savedBehavior)
    setIncidentLimit(savedIncidentLimit)
    setMaxHiddenSeconds(savedMaxHiddenSeconds)
  }, [selection, savedBehavior, savedIncidentLimit, savedMaxHiddenSeconds])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!selectedPolicy) return
    setSaving(true)
    setMessage('')
    try {
      await saveAssessmentIntegrityPolicy({
        assessmentType: selectedPolicy.assessmentType,
        assessmentId: selectedPolicy.assessmentId,
        behavior,
        incidentLimit: Number(incidentLimit),
        maxHiddenSeconds: Number(maxHiddenSeconds),
      })
      setMessage('Integrity policy saved.')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  if (!available) {
    return (
      <div className="empty-state">
        <h3>Integrity policies require migration 057</h3>
        <p>Apply the Phase 5.3 migration to configure enforcement.</p>
      </div>
    )
  }
  if (!policies.length) {
    return (
      <div className="empty-state">
        <h3>No assessments available</h3>
        <p>Create a quiz or CLI practical before configuring a policy.</p>
      </div>
    )
  }

  return (
    <form className="integrity-policy-editor" onSubmit={handleSubmit}>
      <label className="integrity-policy-editor__assessment">
        Assessment
        <select
          value={selection}
          onChange={(event) => setSelection(event.target.value)}
        >
          {policies.map((policy) => (
            <option
              key={`${policy.assessmentType}:${policy.assessmentId}`}
              value={`${policy.assessmentType}:${policy.assessmentId}`}
            >
              {policy.courseCode} - {policy.title} ({policy.assessmentType === 'cli' ? 'CLI' : 'Quiz'})
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid form-grid--three">
        <label>
          Response to incidents
          <select value={behavior} onChange={(event) => setBehavior(event.target.value)}>
            <option value="monitor">Monitor only</option>
            <option value="warn">Record and warn</option>
            <option value="auto_submit">Automatically submit</option>
          </select>
        </label>
        <label>
          Incident limit
          <input
            type="number"
            min="1"
            max="100"
            value={incidentLimit}
            onChange={(event) => setIncidentLimit(event.target.value)}
          />
        </label>
        <label>
          Maximum time away (seconds)
          <input
            type="number"
            min="5"
            max="3600"
            value={maxHiddenSeconds}
            onChange={(event) => setMaxHiddenSeconds(event.target.value)}
          />
        </label>
      </div>
      <p className="integrity-policy-editor__note">
        Automatic submission occurs when either threshold is reached. Brief
        focus changes remain reviewable events and are not counted as incidents.
        {selectedPolicy?.assessmentType === 'quiz' && (
          <> Exiting fullscreen is allowed during quizzes and does not count as an incident.</>
        )}
      </p>
      <button className="primary" type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save integrity policy'}
      </button>
      {message && <p className="form-message">{message}</p>}
    </form>
  )
}

export default function ExamControlsDashboard({ administratorMode = false }) {
  const [activeSection, setActiveSection] = useInstructorSubsection(
    'exam-controls', administratorMode,
  )
  const [workspace, setWorkspace] = useState({
    students: [],
    quizzes: [],
    assignments: [],
    accommodations: [],
    integrityPolicies: [],
    integrityPoliciesAvailable: true,
    activeAttempts: [],
  })
  const [loading, setLoading, hasLoaded, markLoaded] = useDataLoadState()
  const [loadFailed, setLoadFailed] = useState(false)
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [expandedClassIds, setExpandedClassIds] = useState([])
  const [expandedScheduleCourseCodes, setExpandedScheduleCourseCodes] =
    useState([])
  const { confirm, confirmationDialog } = useConfirmationDialog()

  const loadWorkspace = useCallback(async ({ silent = false } = {}) => {
    setLoadFailed(false)
    try {
      if (!silent) setLoading(true)
      setMessage('')
      setWorkspace(await getExamControlsWorkspace())
      markLoaded()
    } catch (error) {
      setLoadFailed(true)
      setMessage(error.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [markLoaded, setLoading])

  useEffect(() => {
    void loadWorkspace()
    const intervalId = window.setInterval(() => {
      void loadWorkspace({ silent: true })
    }, 10000)
    return () => window.clearInterval(intervalId)
  }, [loadWorkspace])

  const assignmentsByCourse = useMemo(() => {
    const courseGroups = new Map()

    for (const assignment of workspace.assignments) {
      const quiz = workspace.quizzes.find(
        (item) => item.id === assignment.quizId,
      )
      const courseCode = quiz?.courseCode || 'OTHER'
      if (!courseGroups.has(courseCode)) {
        courseGroups.set(courseCode, {
          code: courseCode,
          title: courseTitles[courseCode] || 'Other assessments',
          classes: new Map(),
        })
      }
      const classGroups = courseGroups.get(courseCode).classes
      if (!classGroups.has(assignment.classId)) {
        classGroups.set(assignment.classId, {
          classId: assignment.classId,
          classCode: assignment.classCode,
          className: assignment.className,
          assignments: [],
        })
      }
      classGroups.get(assignment.classId).assignments.push(assignment)
    }

    return [...courseGroups.values()]
      .map((courseGroup) => ({
        ...courseGroup,
        classes: [...courseGroup.classes.values()]
          .map((classGroup) => ({
            ...classGroup,
            assignments: [...classGroup.assignments].sort((left, right) =>
              left.quizTitle.localeCompare(right.quizTitle),
            ),
          }))
          .sort((left, right) =>
            left.className.localeCompare(right.className),
          ),
      }))
      .sort(
        (left, right) =>
          (courseOrder[left.code] ?? 98)
          - (courseOrder[right.code] ?? 98)
          || left.code.localeCompare(right.code),
      )
  }, [workspace.assignments, workspace.quizzes])

  function isClassExpanded(classId) {
    return expandedClassIds.includes(String(classId))
  }

  function toggleClass(classId) {
    const normalizedClassId = String(classId)

    setExpandedClassIds((current) =>
      current.includes(normalizedClassId)
        ? current.filter((id) => id !== normalizedClassId)
        : [...current, normalizedClassId],
    )
  }

  function toggleScheduleCourse(courseCode) {
    setExpandedScheduleCourseCodes((current) =>
      current.includes(courseCode)
        ? current.filter((code) => code !== courseCode)
        : [...current, courseCode],
    )
  }

  async function handleDelete(accommodation) {
    const confirmed = await confirm({
      title: 'Remove student accommodation?',
      message: `Remove the accommodation for ${accommodation.studentName}? The student will return to the quiz’s standard time, availability, and attempt limits.`,
      confirmLabel: 'Remove accommodation',
      tone: 'danger',
    })
    if (!confirmed) return
    setBusyId(accommodation.id)
    try {
      await deleteStudentQuizAccommodation(accommodation.id)
      await loadWorkspace()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleGrantAttempt(accommodation) {
    setBusyId(accommodation.id)
    try {
      await grantStudentExtraAttempt(
        accommodation.quizId,
        accommodation.studentId,
      )
      await loadWorkspace()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="exam-controls">
      {confirmationDialog}
      <WorkspaceSubsectionNav
        page="exam-controls"
        activeSection={activeSection}
        onChange={setActiveSection}
      />
      <SurfaceCard
        id="exam-controls-subsection-schedules"
        className="exam-control-panel workspace-subsection-panel"
        hidden={activeSection !== 'schedules'}
      >
        <SectionHeader
          eyebrow="CLASS SCHEDULING"
          title="Assignment schedules"
          description="Set a separate opening and closing time for each assigned class."
        />
        <DataLoadBoundary loading={loading} ready={hasLoaded} error={loadFailed} onRetry={() => loadWorkspace()} label="Loading assignment schedules...">
        {!workspace.assignments.length ? (
          <div className="empty-state">
            <h3>No class assignments</h3>
            <p>Assign a quiz to a class before setting its schedule.</p>
          </div>
        ) : (
          <div className="assignment-course-groups">
            {assignmentsByCourse.map((courseGroup) => {
              const courseExpanded = expandedScheduleCourseCodes.includes(
                courseGroup.code,
              )
              const coursePanelId =
                `assignment-course-panel-${courseGroup.code}`
              const assignmentCount = courseGroup.classes.reduce(
                (total, classGroup) =>
                  total + classGroup.assignments.length,
                0,
              )
              return (
                <section
                  className="assignment-course-group"
                  key={courseGroup.code}
                >
                  <header className="assignment-course-group__header">
                    <div className="assignment-course-group__identity">
                      <span className="course-code">{courseGroup.code}</span>
                      <div>
                        <h3>{courseGroup.title}</h3>
                        <small>
                          {assignmentCount}{' '}
                          {assignmentCount === 1 ? 'schedule' : 'schedules'}
                        </small>
                      </div>
                    </div>
                    <button
                      className="module-collapse-button"
                      type="button"
                      aria-expanded={courseExpanded}
                      aria-controls={coursePanelId}
                      onClick={() => toggleScheduleCourse(courseGroup.code)}
                    >
                      {courseExpanded
                        ? 'Hide course schedules'
                        : 'Show course schedules'}
                    </button>
                  </header>
                  {courseExpanded && (
                    <div
                      className="assignment-class-groups"
                      id={coursePanelId}
                    >
                      {courseGroup.classes.map((classGroup) => {
                        const expanded = isClassExpanded(classGroup.classId)
                        const panelId =
                          `assignment-class-panel-${classGroup.classId}`
                        return (
                          <section
                            className="assignment-class-group"
                            key={classGroup.classId}
                          >
                            <header className="assignment-class-group__heading">
                              <div>
                                <span className="course-code">
                                  {classGroup.classCode}
                                </span>
                                <h3>{classGroup.className}</h3>
                              </div>
                              <div className="assignment-class-group__collapse-controls">
                                <span className="status-chip">
                                  {classGroup.assignments.length}{' '}
                                  {classGroup.assignments.length === 1
                                    ? 'quiz'
                                    : 'quizzes'}
                                </span>
                                <button
                                  className="assignment-class-collapse-button"
                                  type="button"
                                  aria-expanded={expanded}
                                  aria-controls={panelId}
                                  onClick={() =>
                                    toggleClass(classGroup.classId)
                                  }
                                >
                                  {expanded
                                    ? 'Hide schedules'
                                    : 'Show schedules'}
                                </button>
                              </div>
                            </header>
                            {expanded && (
                              <div id={panelId}>
                                <ResponsiveGrid min="17.5rem" className="schedule-card-grid">
                                  {classGroup.assignments.map((assignment) => (
                                    <AssignmentScheduleCard
                                      key={`${assignment.id}-${assignment.availableFrom}-${assignment.availableUntil}`}
                                      assignment={assignment}
                                      onSaved={loadWorkspace}
                                    />
                                  ))}
                                </ResponsiveGrid>
                              </div>
                            )}
                          </section>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
        </DataLoadBoundary>
      </SurfaceCard>

      <SurfaceCard
        id="exam-controls-subsection-integrity"
        className="exam-control-panel workspace-subsection-panel"
        hidden={activeSection !== 'integrity'}
      >
        <SectionHeader
          eyebrow="INTEGRITY ENFORCEMENT"
          title="Assessment policies"
          description="Choose whether browser incidents are monitored, shown as student warnings, or used to submit an attempt automatically."
        />
        <DataLoadBoundary loading={loading} ready={hasLoaded} error={loadFailed} onRetry={() => loadWorkspace()} label="Loading assessment policies...">
        <IntegrityPolicyEditor
          policies={workspace.integrityPolicies}
          available={workspace.integrityPoliciesAvailable}
          onSaved={loadWorkspace}
        />
        </DataLoadBoundary>
      </SurfaceCard>

      <SurfaceCard
        id="exam-controls-subsection-accommodations"
        className="exam-control-panel workspace-subsection-panel"
        hidden={activeSection !== 'accommodations'}
      >
        <SectionHeader
          eyebrow="ACCOMMODATIONS"
          title="Individual student controls"
          description="Grant extra time, extra attempts, or an individual availability window."
        />
        <DataLoadBoundary loading={loading} ready={hasLoaded} error={loadFailed} onRetry={() => loadWorkspace()} label="Loading student controls...">
        <AccommodationEditor
          students={workspace.students}
          quizzes={workspace.quizzes}
          onSaved={loadWorkspace}
        />

        {!!workspace.accommodations.length && (
          <div
            className="accommodation-table-wrapper"
            role="region"
            aria-label="Student quiz accommodations table"
            tabIndex="0"
          >
            <table className="accommodation-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Quiz</th>
                  <th>Extra time</th>
                  <th>Extra attempts</th>
                  <th>Availability override</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workspace.accommodations.map((accommodation) => (
                  <tr key={accommodation.id}>
                    <td>{accommodation.studentName}</td>
                    <td>{accommodation.quizTitle}</td>
                    <td>{accommodation.extraTimeMinutes} minutes</td>
                    <td>{accommodation.extraAttempts}</td>
                    <td>
                      <small>
                        {formatDate(accommodation.availableFrom)}
                        <br />
                        to {formatDate(accommodation.availableUntil)}
                      </small>
                    </td>
                    <td>
                      <ActionBar className="exam-control-actions tw:my-0 tw:border-0 tw:bg-transparent tw:p-0" actions={
                        <>
                        <button
                          className="primary"
                          type="button"
                          disabled={busyId === accommodation.id}
                          onClick={() => void handleGrantAttempt(accommodation)}
                        >
                          Grant +1 attempt
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={busyId === accommodation.id}
                          onClick={() => void handleDelete(accommodation)}
                        >
                          Remove
                        </button>
                        </>
                      } />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </DataLoadBoundary>
      </SurfaceCard>

      <SurfaceCard
        id="exam-controls-subsection-monitoring"
        className="exam-control-panel workspace-subsection-panel"
        hidden={activeSection !== 'monitoring'}
      >
        <SectionHeader
          eyebrow="LIVE MONITORING"
          title="Active attempts"
          description="Updates automatically every 10 seconds. Events are indicators for review."
          actions={
            <RefreshButton loading={loading} label="Refresh now" onClick={() => void loadWorkspace()} />
          }
        />
        <DataLoadBoundary loading={loading} ready={hasLoaded} label="Loading active attempts...">
        <LiveAttemptMonitor
          attempts={workspace.activeAttempts}
          controlsAvailable={workspace.monitoringControlsAvailable}
          onSubmitted={() => loadWorkspace({ silent: true })}
        />
        </DataLoadBoundary>
      </SurfaceCard>

      {message && <p className="form-message form-message--error">{message}</p>}
    </div>
  )
}
