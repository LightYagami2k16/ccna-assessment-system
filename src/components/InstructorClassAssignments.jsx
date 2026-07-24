import { useCallback, useEffect, useState } from 'react'
import {
  deleteClassSection,
  getAssignmentWorkspace,
  saveClassSection,
  saveQuizAccess,
} from '../services/assignmentService'

function ClassEditor({ students, classSection, onSaved, onCancel }) {
  const [name, setName] = useState(classSection?.name ?? '')
  const [code, setCode] = useState(classSection?.code ?? '')
  const [academicTerm, setAcademicTerm] = useState(classSection?.academicTerm ?? '')
  const [isActive, setIsActive] = useState(classSection?.isActive ?? true)
  const [studentIds, setStudentIds] = useState(classSection?.studentIds ?? [])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

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
      setMessage('Class name and code are required.')
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
          <p>Add registered student accounts to a class section.</p>
        </div>
        {classSection && (
          <button className="secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit}>
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
            Class code
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
                    <strong>{student.fullName || 'Unnamed student'}</strong>
                    <small>{student.email || student.id}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <button className="primary" type="submit" disabled={saving}>
          {saving ? 'Saving class...' : classSection ? 'Save class' : 'Create class'}
        </button>
        {message && <p className="form-message form-message--error">{message}</p>}
      </form>
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
    quizzes: [],
  })
  const [editingClass, setEditingClass] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)
  const [message, setMessage] = useState('')

  const loadWorkspace = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      setWorkspace(await getAssignmentWorkspace())
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
          <div className="class-card-grid">
            {workspace.classes.map((classSection) => (
              <article className="class-card" key={classSection.id}>
                <header>
                  <span className="course-code">{classSection.code}</span>
                  <span
                    className={`content-status ${
                      classSection.isActive
                        ? 'content-status--published'
                        : 'content-status--draft'
                    }`}
                  >
                    {classSection.isActive ? 'active' : 'inactive'}
                  </span>
                </header>
                <h3>{classSection.name}</h3>
                <p>{classSection.academicTerm || 'No academic term'}</p>
                <strong>{classSection.studentIds.length} students</strong>
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
                    {deletingId === classSection.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

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
          <div className="quiz-access-grid">
            {workspace.quizzes.map((quiz) => (
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
                classes={workspace.classes.filter((item) => item.isActive)}
                onSaved={loadWorkspace}
              />
            ))}
          </div>
        )}
      </section>

      {message && <p className="form-message form-message--error">{message}</p>}
    </div>
  )
}
