import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import QRCode from 'qrcode'
import {
  addStudentToClassByEmail,
  deleteClassSection,
  deleteClassSections,
  generateClassJoinCode,
  getAssignmentWorkspace,
  resetClassStudentPassword,
  reviewClassJoinRequest,
  saveClassSection,
  saveQuizAccess,
} from '../services/assignmentService'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
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
  MULTI: 'Multiple CCNA courses',
  OTHER: 'Other classes',
}

const courseOrder = {
  ITN: 1,
  SRWE: 2,
  ENSA: 3,
  MULTI: 98,
  OTHER: 99,
}

function sortCourseGroups(groups) {
  return [...groups].sort(
    (left, right) =>
      (courseOrder[left.code] ?? 97) - (courseOrder[right.code] ?? 97)
      || left.code.localeCompare(right.code),
  )
}

function ClassEditor({ students, classSection, onSaved, onCancel }) {
  const isEditing = Boolean(classSection)
  const [name, setName] = useState(classSection?.name ?? '')
  const [code, setCode] = useState(classSection?.code ?? '')
  const [academicTerm, setAcademicTerm] = useState(classSection?.academicTerm ?? '')
  const [isActive, setIsActive] = useState(classSection?.isActive ?? true)
  const [studentIds, setStudentIds] = useState(classSection?.studentIds ?? [])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState(isEditing)

  useEffect(() => {
    if (isEditing) {
      setExpanded(true)
    }
  }, [isEditing, classSection?.id])

  function toggleStudent(studentId) {
    setStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!name.trim() || !code.trim()) {
      setMessage('Class name and class identifier are required.')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      await saveClassSection({
        id: classSection?.id ?? null,
        name: name.trim(),
        code: code.trim(),
        academicTerm: academicTerm.trim(),
        isActive,
        studentIds,
      })
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="class-editor">
      <SectionHeader
        className="section-heading"
        eyebrow="CLASS MANAGEMENT"
        title={classSection ? 'Edit class' : 'Create class'}
        description="Create the class record first. A unique student join code is generated automatically."
        actions={(<div className="class-editor__heading-controls">
          {classSection && (
            <button className="secondary" type="button" onClick={onCancel}>
              Cancel
            </button>
          )}

          <button
            className="module-collapse-button"
            type="button"
            aria-expanded={expanded}
            aria-controls="class-editor-form"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded
              ? 'Hide form'
              : classSection
                ? 'Show form'
                : 'Create class'}
          </button>
        </div>)}
      />

      {expanded && (
      <form id="class-editor-form" onSubmit={handleSubmit}>
        <ResponsiveGrid min="14rem" className="form-grid form-grid--three">
          <label>
            Class name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Example: CCNA 1 - Section A"
            />
          </label>
          <label>
            Class identifier
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Example: ITN-A"
            />
          </label>
          <label>
            Academic term
            <input
              value={academicTerm}
              onChange={(event) => setAcademicTerm(event.target.value)}
              placeholder="Example: 2026-2027 Semester 1"
            />
          </label>
        </ResponsiveGrid>

        <label className="check-control class-active-control">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Active class
        </label>

        {classSection && (
          <fieldset className="student-picker form-fieldset">
            <legend>Enrolled students ({studentIds.length})</legend>
            {!students.length ? (
              <p>
                No student accounts exist yet. Register or create student
                accounts before adding class members.
              </p>
            ) : (
              <div className="student-picker__grid">
                {students.map((student) => (
                  <label className="student-picker__row" key={student.id}>
                    <input
                      type="checkbox"
                      checked={studentIds.includes(student.id)}
                      onChange={() => toggleStudent(student.id)}
                    />
                    <span>
                      <strong>
                        {student.fullName || 'Unnamed student'}
                      </strong>
                      <small>{student.email || student.id}</small>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <ActionBar className="class-editor__actions">
          <button className="primary" type="submit" disabled={saving}>
            {saving ? 'Saving class...' : classSection ? 'Save class' : 'Create class'}
          </button>
        </ActionBar>
        {message && <p className="form-message form-message--error">{message}</p>}
      </form>
      )}
    </section>
  )
}

function buildClassJoinUrl(joinCode) {
  const url = new URL(window.location.href)
  url.searchParams.set('classCode', joinCode)
  return url.toString()
}

function ClassEnrollmentTools({ classSection, onChanged }) {
  const [email, setEmail] = useState('')
  const [addingStudent, setAddingStudent] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [message, setMessage] = useState('')
  const { confirm, confirmationDialog } = useConfirmationDialog()

  async function handleRegenerateCode() {
    const confirmed = await confirm({
      title: 'Generate a new class code?',
      message:
        'The previous join code and QR code will stop working immediately. Already enrolled students will remain in the class.',
      confirmLabel: 'Generate new code',
      tone: 'danger',
    })
    if (!confirmed) return

    setGeneratingCode(true)
    setMessage('')
    try {
      await generateClassJoinCode(classSection.id)
      setShowQr(false)
      setQrDataUrl('')
      setMessage('A new join code was generated.')
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setGeneratingCode(false)
    }
  }

  async function handleShowQr() {
    setMessage('')
    try {
      const dataUrl = await QRCode.toDataURL(
        buildClassJoinUrl(classSection.joinCode),
        {
          width: 280,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#082f49',
            light: '#ffffff',
          },
        },
      )
      setQrDataUrl(dataUrl)
      setShowQr(true)
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(classSection.joinCode)
      setMessage('Join code copied.')
    } catch {
      setMessage(`Join code: ${classSection.joinCode}`)
    }
  }

  async function handleManualEnrollment(event) {
    event.preventDefault()
    if (!email.trim()) {
      setMessage('Enter the student account email address.')
      return
    }

    setAddingStudent(true)
    setMessage('')
    try {
      const student = await addStudentToClassByEmail({
        classId: classSection.id,
        email: email.trim(),
      })
      setEmail('')
      setMessage(
        `${student.fullName || student.email} was added to the class.`,
      )
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setAddingStudent(false)
    }
  }

  return (
    <section className="class-enrollment-tools">
      {confirmationDialog}
      <div className="class-join-code">
        <span>Student join code</span>
        <strong>{classSection.joinCode}</strong>
      </div>

      <div className="class-enrollment-tools__actions">
        <button
          className="secondary"
          type="button"
          onClick={() => void handleCopyCode()}
        >
          Copy code
        </button>
        <button
          className="secondary"
          type="button"
          disabled={generatingCode}
          onClick={() => void handleRegenerateCode()}
        >
          {generatingCode ? 'Generating...' : 'New code'}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() =>
            showQr ? setShowQr(false) : void handleShowQr()
          }
        >
          {showQr ? 'Hide QR code' : 'Show QR code'}
        </button>
      </div>

      {showQr && qrDataUrl && (
        <div className="class-qr-code">
          <img
            src={qrDataUrl}
            alt={`QR code for joining ${classSection.name}`}
          />
          <p>
            Students can scan this code, sign in, and submit an
            enrollment request.
          </p>
          <a
            className="secondary qr-download-link"
            href={qrDataUrl}
            download={`${classSection.code}-join-qr.png`}
          >
            Download QR code
          </a>
        </div>
      )}

      <form
        className="manual-enrollment-form"
        onSubmit={handleManualEnrollment}
      >
        <label>
          Add a registered student by email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="student@example.com"
          />
        </label>
        <button className="primary" type="submit" disabled={addingStudent}>
          {addingStudent ? 'Adding...' : 'Add student'}
        </button>
      </form>

      {message && <p className="form-message">{message}</p>}
    </section>
  )
}

function EnrollmentApprovalPanel({ courseGroups, requests, onChanged }) {
  const [reviewingId, setReviewingId] = useState(null)
  const [message, setMessage] = useState('')
  const [expandedCourseCodes, setExpandedCourseCodes] = useState([])

  useEffect(() => {
    const availableCodes = courseGroups.map((group) => group.code)
    setExpandedCourseCodes((current) =>
      current.filter((code) => availableCodes.includes(code)),
    )
  }, [courseGroups])

  function toggleCourse(code) {
    setExpandedCourseCodes((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : [...current, code],
    )
  }

  async function handleDecision(request, decision) {
    setReviewingId(request.id)
    setMessage('')
    try {
      await reviewClassJoinRequest({
        requestId: request.id,
        decision,
      })
      setMessage(
        decision === 'approved'
          ? `${request.studentName || request.studentEmail} was enrolled.`
          : 'The enrollment request was rejected.',
      )
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <section className="enrollment-approval-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ENROLLMENT APPROVALS</span>
          <h2>Pending class requests</h2>
          <p>
            Review students who joined with a class code or QR code.
          </p>
        </div>
        {requests.length > 0 && (
          <span className="status-chip">{requests.length} pending</span>
        )}
      </div>

      {!requests.length ? (
        <div className="empty-state">
          <h3>No pending requests</h3>
          <p>New student requests will appear here for approval.</p>
        </div>
      ) : (
        <div className="approval-course-groups">
          {courseGroups.map((courseGroup) => {
            const expanded = expandedCourseCodes.includes(courseGroup.code)
            const panelId = `approval-course-${courseGroup.code}`
            return (
            <section className="approval-course-group" key={courseGroup.code}>
              <header className="approval-course-group__header">
                <div className="approval-course-group__identity">
                  <span className="course-code">{courseGroup.code}</span>
                  <div>
                    <h3>{courseGroup.title}</h3>
                    <small>
                      {courseGroup.requests.length}{' '}
                      {courseGroup.requests.length === 1
                        ? 'request'
                        : 'requests'}
                    </small>
                  </div>
                </div>
                <button
                  className="module-collapse-button"
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => toggleCourse(courseGroup.code)}
                >
                  {expanded ? 'Hide requests' : 'Show requests'}
                </button>
              </header>
              {expanded && (
                <div className="approval-request-list" id={panelId}>
                {courseGroup.requests.map((request) => (
            <article className="approval-request-card" key={request.id}>
              <div>
                <span className="course-code">{request.classCode}</span>
                <h3>{request.studentName || 'Unnamed student'}</h3>
                <p>{request.studentEmail}</p>
                <small>
                  Requested {new Date(request.requestedAt).toLocaleString()}
                  {' · '}
                  {request.className}
                </small>
              </div>
              <div className="approval-request-card__actions">
                <button
                  className="primary"
                  type="button"
                  disabled={reviewingId === request.id}
                  onClick={() =>
                    void handleDecision(request, 'approved')
                  }
                >
                  Approve
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={reviewingId === request.id}
                  onClick={() =>
                    void handleDecision(request, 'rejected')
                  }
                >
                  Reject
                </button>
              </div>
            </article>
                ))}
                </div>
              )}
            </section>
            )
          })}
        </div>
      )}

      {message && <p className="form-message">{message}</p>}
    </section>
  )
}

function QuizAccessCard({ quiz, classes, onSaved }) {
  const [classIds, setClassIds] = useState(quiz.classIds ?? [])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  function toggleClass(classId) {
    setClassIds((current) =>
      current.includes(classId)
        ? current.filter((id) => id !== classId)
        : [...current, classId],
    )
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      await saveQuizAccess({
        quizId: quiz.id,
        accessMode: 'assigned_classes',
        classIds,
      })
      setMessage('Quiz access saved.')
      await onSaved()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="quiz-access-card">
      <header>
        <div>
          <span className="course-code">{quiz.courseCode}</span>
          <h3>{quiz.title}</h3>
        </div>
        <span className={`content-status content-status--${quiz.status}`}>
          {quiz.status}
        </span>
      </header>

      <div className="assignment-requirement">
        <strong>Class assignment required</strong>
        <p>
          Publishing this quiz will not make it visible until at least one
          active class is selected below.
        </p>
      </div>

      <div className="class-assignment-options">
        {!classes.length ? (
          <p>Create an active class before assigning this quiz.</p>
        ) : (
          classes.map((classSection) => (
            <label key={classSection.id}>
              <input
                type="checkbox"
                checked={classIds.includes(classSection.id)}
                onChange={() => toggleClass(classSection.id)}
              />
              <span>
                <strong>{classSection.code}</strong> - {classSection.name}
              </span>
            </label>
          ))
        )}
      </div>

      <button
        className="primary"
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
      >
        {saving ? 'Saving access...' : 'Save quiz access'}
      </button>
      {message && (
        <p
          className={
            message === 'Quiz access saved.'
              ? 'form-message'
              : 'form-message form-message--error'
          }
        >
          {message}
        </p>
      )}
    </article>
  )
}

export default function InstructorClassAssignments() {
  const [workspace, setWorkspace] = useState({
    students: [],
    classes: [],
    approvalRequests: [],
    quizzes: [],
  })
  const [editingClass, setEditingClass] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)
  const [selectedClassIds, setSelectedClassIds] = useState([])
  const [expandedClassIds, setExpandedClassIds] = useState([])
  const [expandedStudentClassIds, setExpandedStudentClassIds] =
    useState([])
  const [expandedQuizCourseCodes, setExpandedQuizCourseCodes] =
    useState([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [resettingStudentId, setResettingStudentId] =
    useState(null)
  const [temporaryPassword, setTemporaryPassword] =
    useState(null)
  const [copiedPasswordStudentId, setCopiedPasswordStudentId] =
    useState(null)
  const [message, setMessage] = useState('')
  const { confirm, confirmationDialog } = useConfirmationDialog()

  const quizzesByCourse = useMemo(() => {
    const groups = new Map()

    workspace.quizzes.forEach((quiz) => {
      const courseCode = quiz.courseCode || 'OTHER'

      if (!groups.has(courseCode)) {
        groups.set(courseCode, {
          code: courseCode,
          title: courseTitles[courseCode] || 'Other CCNA quizzes',
          quizzes: [],
        })
      }

      groups.get(courseCode).quizzes.push(quiz)
    })

    return sortCourseGroups(
      [...groups.values()].map((group) => ({
        ...group,
        quizzes: [...group.quizzes].sort((left, right) =>
          left.title.localeCompare(right.title, undefined, {
            sensitivity: 'base',
          }),
        ),
      })),
    )
  }, [workspace.quizzes])

  const classCourseGroups = useMemo(() => {
    const groups = new Map()

    workspace.classes.forEach((classSection) => {
      const assignedCourseCodes = [
        ...new Set(
          classSection.courseCodes?.length
            ? classSection.courseCodes
            : workspace.quizzes
              .filter((quiz) => quiz.classIds?.includes(classSection.id))
              .map((quiz) => quiz.courseCode)
              .filter(Boolean),
        ),
      ]
      const normalizedClassCode = String(classSection.code ?? '').toUpperCase()
      const codePrefix = ['ITN', 'SRWE', 'ENSA'].find(
        (code) =>
          normalizedClassCode === code
          || normalizedClassCode.startsWith(`${code}-`)
          || normalizedClassCode.startsWith(`${code}_`),
      )
      const courseCode =
        assignedCourseCodes.length === 1
          ? assignedCourseCodes[0]
          : assignedCourseCodes.length > 1
            ? 'MULTI'
            : codePrefix || 'OTHER'

      if (!groups.has(courseCode)) {
        groups.set(courseCode, {
          code: courseCode,
          title: courseTitles[courseCode] || 'Other classes',
          classes: [],
        })
      }
      groups.get(courseCode).classes.push(classSection)
    })

    return sortCourseGroups(
      [...groups.values()].map((group) => ({
        ...group,
        classes: [...group.classes].sort((left, right) =>
          left.name.localeCompare(right.name, undefined, {
            sensitivity: 'base',
          }),
        ),
      })),
    )
  }, [workspace.classes, workspace.quizzes])

  const approvalCourseGroups = useMemo(() => {
    const classCourseCodes = new Map()
    classCourseGroups.forEach((group) => {
      group.classes.forEach((classSection) => {
        classCourseCodes.set(classSection.id, group.code)
      })
    })
    const groups = new Map()

    workspace.approvalRequests.forEach((request) => {
      const code = classCourseCodes.get(request.classId) || 'OTHER'
      if (!groups.has(code)) {
        groups.set(code, {
          code,
          title: courseTitles[code] || 'Other classes',
          requests: [],
        })
      }
      groups.get(code).requests.push(request)
    })

    return sortCourseGroups([...groups.values()])
  }, [classCourseGroups, workspace.approvalRequests])

  const loadWorkspace = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      const data = await getAssignmentWorkspace()
      setWorkspace(data)
      setSelectedClassIds((current) =>
        current.filter((classId) =>
          data.classes.some(
            (classSection) => classSection.id === classId,
          ),
        ),
      )
      setExpandedStudentClassIds((current) =>
        current.filter((classId) =>
          data.classes.some(
            (classSection) => classSection.id === classId,
          ),
        ),
      )
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  async function handleDelete(classSection) {
    const confirmed = await confirm({
      title: 'Delete class?',
      message: `Delete “${classSection.name}”? Its memberships and quiz assignments will also be removed. Student attempt history will remain.`,
      confirmLabel: 'Delete class',
      tone: 'danger',
    })
    if (!confirmed) return

    setDeletingId(classSection.id)
    setMessage('')
    try {
      await deleteClassSection(classSection.id)
      if (editingClass?.id === classSection.id) setEditingClass(null)
      await loadWorkspace()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setDeletingId(null)
    }
  }

  function toggleClassSelection(classIds, checked) {
    setSelectedClassIds((current) =>
      checked
        ? [...new Set([...current, ...classIds])]
        : current.filter((id) => !classIds.includes(id)),
    )
  }

  function toggleClassDetails(classId) {
    setExpandedClassIds((current) =>
      current.includes(classId)
        ? current.filter((id) => id !== classId)
        : [...current, classId],
    )
  }

  function toggleClassStudents(classId) {
    setExpandedStudentClassIds((current) =>
      current.includes(classId)
        ? current.filter((id) => id !== classId)
        : [...current, classId],
    )
  }

  function toggleQuizCourse(courseCode) {
    setExpandedQuizCourseCodes((current) =>
      current.includes(courseCode)
        ? current.filter((code) => code !== courseCode)
        : [...current, courseCode],
    )
  }

  async function handleResetStudentPassword(classSection, student) {
    const confirmed = await confirm({
      title: 'Reset student password?',
      message:
        `Create a temporary password for ${student.fullName || student.email}? Their current password will stop working immediately, and they must create a new password before opening their workspace.`,
      confirmLabel: 'Reset password',
      tone: 'danger',
    })
    if (!confirmed) return

    setResettingStudentId(student.id)
    setTemporaryPassword(null)
    setCopiedPasswordStudentId(null)
    setMessage('')
    try {
      const result = await resetClassStudentPassword({
        classId: classSection.id,
        studentId: student.id,
      })
      setTemporaryPassword({
        classId: classSection.id,
        studentId: student.id,
        value: result.temporaryPassword,
      })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setResettingStudentId(null)
    }
  }

  async function copyTemporaryPassword(studentId, password) {
    try {
      await navigator.clipboard.writeText(password)
      setCopiedPasswordStudentId(studentId)
    } catch {
      setMessage(
        'Unable to copy automatically. Select and copy the temporary password.',
      )
    }
  }

  async function handleBulkDelete() {
    if (!selectedClassIds.length) return

    const confirmed = await confirm({
      title: `Delete ${selectedClassIds.length} selected ${
        selectedClassIds.length === 1 ? 'class' : 'classes'
      }?`,
      message:
        'Their memberships and quiz assignments will also be removed. Student quiz attempt history will remain. This action cannot be undone.',
      confirmLabel: 'Delete selected',
      tone: 'danger',
    })
    if (!confirmed) return

    setBulkDeleting(true)
    setMessage('')
    try {
      await deleteClassSections(selectedClassIds)
      if (selectedClassIds.includes(editingClass?.id)) {
        setEditingClass(null)
      }
      setSelectedClassIds([])
      await loadWorkspace()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBulkDeleting(false)
    }
  }

  if (loading) {
    return (
      <section className="class-assignment-manager">
        Loading classes and assignments...
      </section>
    )
  }

  return (
    <div className="class-assignment-manager">
      {confirmationDialog}
      <ClassEditor
        key={editingClass?.id ?? 'new-class'}
        students={workspace.students}
        classSection={editingClass}
        onSaved={async () => {
          setEditingClass(null)
          await loadWorkspace()
        }}
        onCancel={() => setEditingClass(null)}
      />

      <section className="class-list-panel">
        <SectionHeader
          className="section-heading"
          eyebrow="CLASS SECTIONS"
          title="Your classes"
          actions={(
            <span className="status-chip">{workspace.classes.length} classes</span>
          )}
        />
        {!workspace.classes.length ? (
          <div className="empty-state">
            <h3>No classes created yet</h3>
            <p>Create a class and add registered student accounts.</p>
          </div>
        ) : (
          <>
            <ActionBar className="bulk-action-bar">
              <label className="bulk-select-control">
                <input
                  type="checkbox"
                  checked={workspace.classes.every((classSection) =>
                    selectedClassIds.includes(classSection.id),
                  )}
                  disabled={bulkDeleting}
                  onChange={(event) =>
                    toggleClassSelection(
                      workspace.classes.map(
                        (classSection) => classSection.id,
                      ),
                      event.target.checked,
                    )
                  }
                />
                Select all classes
              </label>

              <div className="bulk-action-bar__actions">
                <span>{selectedClassIds.length} selected</span>
                <button
                  className="danger-button"
                  type="button"
                  disabled={!selectedClassIds.length || bulkDeleting}
                  onClick={() => void handleBulkDelete()}
                >
                  {bulkDeleting ? 'Deleting...' : 'Delete selected'}
                </button>
              </div>
            </ActionBar>

            <ResponsiveGrid className="class-card-grid" min="24rem">
              {workspace.classes.map((classSection) => {
                const expanded = expandedClassIds.includes(
                  classSection.id,
                )
                const studentsExpanded =
                  expandedStudentClassIds.includes(classSection.id)
                const detailsId = `class-details-${classSection.id}`
                const studentsId = `class-students-${classSection.id}`
                const enrolledStudents = classSection.studentIds
                  .map((studentId) =>
                    workspace.students.find(
                      (student) => student.id === studentId,
                    ),
                  )
                  .filter(Boolean)

                return (
                  <SurfaceCard
                    as="article"
                    subtle
                    className="class-card"
                    key={classSection.id}
                  >
                    <label className="card-select-control">
                      <input
                        type="checkbox"
                        checked={selectedClassIds.includes(
                          classSection.id,
                        )}
                        disabled={bulkDeleting}
                        onChange={(event) =>
                          toggleClassSelection(
                            [classSection.id],
                            event.target.checked,
                          )
                        }
                      />
                      Select for deletion
                    </label>
                    <header>
                      <span className="course-code">
                        {classSection.code}
                      </span>
                      <div className="class-card__header-controls">
                        <span
                          className={`content-status ${
                            classSection.isActive
                              ? 'content-status--published'
                              : 'content-status--draft'
                          }`}
                        >
                          {classSection.isActive ? 'active' : 'inactive'}
                        </span>
                        <button
                          className="module-collapse-button"
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={detailsId}
                          onClick={() =>
                            toggleClassDetails(classSection.id)
                          }
                        >
                          {expanded ? 'Hide details' : 'Show details'}
                        </button>
                      </div>
                    </header>
                    <h3>{classSection.name}</h3>
                    <p>
                      {classSection.academicTerm || 'No academic term'}
                    </p>
                    <div className="class-card__student-summary">
                      <strong>
                        {enrolledStudents.length}{' '}
                        {enrolledStudents.length === 1
                          ? 'student'
                          : 'students'}
                      </strong>
                      <button
                        className="module-collapse-button"
                        type="button"
                        aria-expanded={studentsExpanded}
                        aria-controls={studentsId}
                        onClick={() =>
                          toggleClassStudents(classSection.id)
                        }
                      >
                        {studentsExpanded
                          ? 'Hide students'
                          : 'Show students'}
                      </button>
                    </div>
                    {studentsExpanded && (
                      <div
                        className="class-card__students"
                        id={studentsId}
                      >
                        {!enrolledStudents.length ? (
                          <p className="class-card__students-empty">
                            No students are currently enrolled.
                          </p>
                        ) : (
                          <ul className="class-card__student-list">
                            {enrolledStudents.map((student) => (
                              <li key={student.id}>
                                <div className="class-card__student-identity">
                                  <strong>
                                    {student.fullName ||
                                      'Unnamed student'}
                                  </strong>
                                  <small>
                                    {student.email || student.id}
                                  </small>
                                </div>
                                <button
                                  className="secondary"
                                  type="button"
                                  disabled={
                                    resettingStudentId === student.id
                                  }
                                  onClick={() =>
                                    void handleResetStudentPassword(
                                      classSection,
                                      student,
                                    )
                                  }
                                >
                                  {resettingStudentId === student.id
                                    ? 'Resetting...'
                                    : 'Reset password'}
                                </button>
                                {temporaryPassword?.classId ===
                                  classSection.id &&
                                  temporaryPassword.studentId ===
                                    student.id && (
                                    <div className="temporary-password">
                                      <span>Temporary password</span>
                                      <code>
                                        {temporaryPassword.value}
                                      </code>
                                      <button
                                        className="secondary"
                                        type="button"
                                        onClick={() =>
                                          void copyTemporaryPassword(
                                            student.id,
                                            temporaryPassword.value,
                                          )
                                        }
                                      >
                                        {copiedPasswordStudentId ===
                                        student.id
                                          ? 'Copied'
                                          : 'Copy'}
                                      </button>
                                      <small>
                                        Give this password directly to
                                        the student. It will not be shown
                                        again after this page is closed.
                                      </small>
                                    </div>
                                  )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {expanded && (
                      <div className="class-card__details" id={detailsId}>
                        <ClassEnrollmentTools
                          classSection={classSection}
                          onChanged={loadWorkspace}
                        />
                        <div className="class-card__actions">
                          <button
                            className="primary"
                            type="button"
                            onClick={() => setEditingClass(classSection)}
                          >
                            Edit class
                          </button>
                          <button
                            className="secondary"
                            type="button"
                            disabled={deletingId === classSection.id}
                            onClick={() => void handleDelete(classSection)}
                          >
                            {deletingId === classSection.id
                              ? 'Deleting...'
                              : 'Delete'}
                          </button>
                        </div>
                      </div>
                    )}
                  </SurfaceCard>
                )
              })}
            </ResponsiveGrid>
          </>
        )}
      </section>

      <EnrollmentApprovalPanel
        courseGroups={approvalCourseGroups}
        requests={workspace.approvalRequests}
        onChanged={loadWorkspace}
      />

      <section className="quiz-assignment-panel">
        <SectionHeader
          className="section-heading"
          eyebrow="QUIZ ACCESS"
          title="Assign quizzes"
          description="Every quiz must be assigned to at least one active class before students can see or start it."
          actions={(
            <button
              className="secondary"
              type="button"
              onClick={() => void loadWorkspace()}
            >
              Refresh classes
            </button>
          )}
        />
        {!workspace.quizzes.length ? (
          <div className="empty-state">
            <h3>No quizzes available</h3>
            <p>Create a quiz before configuring class access.</p>
          </div>
        ) : (
          <div className="quiz-access-course-groups">
            {quizzesByCourse.map((courseGroup) => {
              const expanded = expandedQuizCourseCodes.includes(
                courseGroup.code,
              )
              const panelId = `quiz-access-course-${courseGroup.code}`

              return (
                <SurfaceCard
                  as="section"
                  subtle
                  className="quiz-access-course-group"
                  key={courseGroup.code}
                >
                  <header className="quiz-access-course-group__header">
                    <div className="quiz-access-course-group__identity">
                      <span className="course-code">
                        {courseGroup.code}
                      </span>
                      <div>
                        <h3>{courseGroup.title}</h3>
                        <p>
                          {courseGroup.quizzes.length}{' '}
                          {courseGroup.quizzes.length === 1
                            ? 'quiz'
                            : 'quizzes'}
                        </p>
                      </div>
                    </div>
                    <button
                      className="module-collapse-button"
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() =>
                        toggleQuizCourse(courseGroup.code)
                      }
                    >
                      {expanded ? 'Hide quizzes' : 'Show quizzes'}
                    </button>
                  </header>

                  {expanded && (
                    <ResponsiveGrid
                      className="quiz-access-grid"
                      id={panelId}
                      min="22rem"
                    >
                      {courseGroup.quizzes.map((quiz) => (
                        <QuizAccessCard
                          key={[
                            quiz.id,
                            quiz.accessMode,
                            quiz.classIds.join('-'),
                            workspace.classes
                              .map((classSection) =>
                                `${classSection.id}:${classSection.isActive}`,
                              )
                              .join('-'),
                          ].join('|')}
                          quiz={quiz}
                          classes={workspace.classes.filter(
                            (item) => item.isActive,
                          )}
                          onSaved={loadWorkspace}
                        />
                      ))}
                    </ResponsiveGrid>
                  )}
                </SurfaceCard>
              )
            })}
          </div>
        )}
      </section>

      {message && <p className="form-message form-message--error">{message}</p>}
    </div>
  )
}
