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
  reviewClassJoinRequest,
  saveClassSection,
  saveQuizAccess,
} from '../services/assignmentService'

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
      <div className="section-heading">
        <div>
          <span className="eyebrow">CLASS MANAGEMENT</span>
          <h2>{classSection ? 'Edit class' : 'Create class'}</h2>
          <p>
            Create the class record first. A unique student join code is
            generated automatically.
          </p>
        </div>
        <div className="class-editor__heading-controls">
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
        </div>
      </div>

      {expanded && (
      <form id="class-editor-form" onSubmit={handleSubmit}>
        <div className="form-grid form-grid--three">
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
        </div>

        <label className="check-control class-active-control">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Active class
        </label>

        {classSection && (
          <fieldset className="student-picker">
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

        <button className="primary" type="submit" disabled={saving}>
          {saving ? 'Saving class...' : classSection ? 'Save class' : 'Create class'}
        </button>
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

  async function handleRegenerateCode() {
    if (
      !window.confirm(
        'Generate a new class join code? The previous code and QR code will stop working.',
      )
    ) {
      return
    }

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

function EnrollmentApprovalPanel({ requests, onChanged }) {
  const [reviewingId, setReviewingId] = useState(null)
  const [message, setMessage] = useState('')

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
        <span className="status-chip">{requests.length} pending</span>
      </div>

      {!requests.length ? (
        <div className="empty-state">
          <h3>No pending requests</h3>
          <p>New student requests will appear here for approval.</p>
        </div>
      ) : (
        <div className="approval-request-list">
          {requests.map((request) => (
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
  const [expandedQuizCourseCodes, setExpandedQuizCourseCodes] =
    useState([])
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [message, setMessage] = useState('')

  const quizzesByCourse = useMemo(() => {
    const courseTitles = {
      ITN: 'Introduction to Networks',
      SRWE: 'Switching, Routing, and Wireless Essentials',
      ENSA: 'Enterprise Networking, Security, and Automation',
    }
    const courseOrder = {
      ITN: 1,
      SRWE: 2,
      ENSA: 3,
    }
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

    return [...groups.values()]
      .map((group) => ({
        ...group,
        quizzes: [...group.quizzes].sort((left, right) =>
          left.title.localeCompare(right.title, undefined, {
            sensitivity: 'base',
          }),
        ),
      }))
      .sort(
        (left, right) =>
          (courseOrder[left.code] ?? 99) -
            (courseOrder[right.code] ?? 99) ||
          left.code.localeCompare(right.code),
      )
  }, [workspace.quizzes])

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
    if (
      !window.confirm(
        `Delete "${classSection.name}"? Its quiz assignments will also be removed.`,
      )
    ) {
      return
    }

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

  function toggleQuizCourse(courseCode) {
    setExpandedQuizCourseCodes((current) =>
      current.includes(courseCode)
        ? current.filter((code) => code !== courseCode)
        : [...current, courseCode],
    )
  }

  async function handleBulkDelete() {
    if (!selectedClassIds.length) return

    if (
      !window.confirm(
        `Delete ${selectedClassIds.length} selected ${
          selectedClassIds.length === 1 ? 'class' : 'classes'
        }?\n\nTheir memberships and quiz assignments will also be removed. Student quiz attempt history will remain. This cannot be undone.`,
      )
    ) {
      return
    }

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
        <div className="section-heading">
          <div>
            <span className="eyebrow">CLASS SECTIONS</span>
            <h2>Your classes</h2>
          </div>
          <span className="status-chip">{workspace.classes.length} classes</span>
        </div>
        {!workspace.classes.length ? (
          <div className="empty-state">
            <h3>No classes created yet</h3>
            <p>Create a class and add registered student accounts.</p>
          </div>
        ) : (
          <>
            <div className="bulk-action-bar">
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
            </div>

            <div className="class-card-grid">
              {workspace.classes.map((classSection) => {
                const expanded = expandedClassIds.includes(
                  classSection.id,
                )
                const detailsId = `class-details-${classSection.id}`

                return (
                <article className="class-card" key={classSection.id}>
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
                  <span className="course-code">{classSection.code}</span>
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
                <p>{classSection.academicTerm || 'No academic term'}</p>
                <strong>{classSection.studentIds.length} students</strong>
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
                </article>
                )
              })}
            </div>
          </>
        )}
      </section>

      <EnrollmentApprovalPanel
        requests={workspace.approvalRequests}
        onChanged={loadWorkspace}
      />

      <section className="quiz-assignment-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">QUIZ ACCESS</span>
            <h2>Assign quizzes</h2>
            <p>
              Every quiz must be assigned to at least one active class before
              students can see or start it.
            </p>
          </div>
          <button
            className="secondary"
            type="button"
            onClick={() => void loadWorkspace()}
          >
            Refresh classes
          </button>
        </div>
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
                <section
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
                    <div className="quiz-access-grid" id={panelId}>
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
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </section>

      {message && <p className="form-message form-message--error">{message}</p>}
    </div>
  )
}
