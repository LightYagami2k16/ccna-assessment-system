import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteInstructorModule,
  getInstructorModuleWorkspace,
  saveInstructorModule,
} from '../services/moduleService'

const emptyForm = {
  id: null,
  courseId: '',
  code: '',
  title: '',
  description: '',
  sortOrder: 0,
}

export default function InstructorModuleManager({ onChanged }) {
  const [workspace, setWorkspace] = useState({
    courses: [],
    modules: [],
  })
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)

  const loadWorkspace = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      setMessageIsError(false)
      setWorkspace(await getInstructorModuleWorkspace())
    } catch (error) {
      setMessage(error.message)
      setMessageIsError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const modulesByCourse = useMemo(
    () =>
      workspace.courses.map((course) => ({
        ...course,
        modules: workspace.modules.filter(
          (module) => module.course_id === course.id,
        ),
      })),
    [workspace],
  )

  function startEdit(module) {
    setForm({
      id: module.id,
      courseId: module.course_id,
      code: module.code,
      title: module.title,
      description: module.description ?? '',
      sortOrder: module.sort_order ?? 0,
    })
    setMessage('')
    setMessageIsError(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setMessageIsError(false)

    try {
      await saveInstructorModule({
        ...form,
        sortOrder: Number(form.sortOrder),
      })
      setForm(emptyForm)
      await loadWorkspace()
      await onChanged?.()
      setMessage(form.id ? 'Module updated.' : 'Module created.')
    } catch (error) {
      setMessage(error.message)
      setMessageIsError(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(module) {
    if (
      !window.confirm(
        `Delete module "${module.code} - ${module.title}"?`,
      )
    ) {
      return
    }

    setDeletingId(module.id)
    setMessage('')
    setMessageIsError(false)
    try {
      await deleteInstructorModule(module.id)
      if (form.id === module.id) setForm(emptyForm)
      await loadWorkspace()
      await onChanged?.()
      setMessage('Module deleted.')
    } catch (error) {
      setMessage(error.message)
      setMessageIsError(true)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="module-manager">
      <div className="section-heading">
        <div>
          <span className="eyebrow">COURSE STRUCTURE</span>
          <h2>Course modules</h2>
          <p>
            Add or edit the modules instructors can select when creating
            questions and quizzes.
          </p>
        </div>
        <span className="status-chip">
          {workspace.modules.length} modules
        </span>
      </div>

      <form className="module-editor" onSubmit={handleSubmit}>
        <div className="form-grid form-grid--three">
          <label>
            Course
            <select
              required
              value={form.courseId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  courseId: event.target.value,
                }))
              }
            >
              <option value="">Select course</option>
              {workspace.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} - {course.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Module code
            <input
              required
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  code: event.target.value,
                }))
              }
              placeholder="Example: ITN-03"
            />
          </label>
          <label>
            Display order
            <input
              type="number"
              min="0"
              value={form.sortOrder}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sortOrder: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <label>
          Module title
          <input
            required
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            placeholder="Example: Protocols and Models"
          />
        </label>

        <label>
          Description
          <textarea
            rows="2"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            placeholder="Optional module description"
          />
        </label>

        <div className="module-editor__actions">
          <button className="primary" type="submit" disabled={saving}>
            {saving
              ? 'Saving...'
              : form.id
                ? 'Save module'
                : 'Add module'}
          </button>
          {form.id && (
            <button
              className="secondary"
              type="button"
              onClick={() => setForm(emptyForm)}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      {message && (
        <p
          className={
            messageIsError
              ? 'form-message form-message--error'
              : 'form-message'
          }
        >
          {message}
        </p>
      )}

      {loading ? (
        <p>Loading course modules...</p>
      ) : (
        <div className="module-course-groups">
          {modulesByCourse.map((course) => (
            <article className="module-course-group" key={course.id}>
              <header>
                <div>
                  <span className="course-code">{course.code}</span>
                  <h3>{course.title}</h3>
                </div>
                <span className="status-chip">
                  {course.modules.length}{' '}
                  {course.modules.length === 1 ? 'module' : 'modules'}
                </span>
              </header>

              {!course.modules.length ? (
                <p className="muted-copy">No modules added yet.</p>
              ) : (
                <div className="module-list">
                  {course.modules.map((module) => (
                    <div className="module-list__row" key={module.id}>
                      <div>
                        <strong>{module.code}</strong>
                        <span>{module.title}</span>
                        {module.description && (
                          <small>{module.description}</small>
                        )}
                      </div>
                      <div className="module-list__actions">
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => startEdit(module)}
                        >
                          Edit
                        </button>
                        <button
                          className="danger-button danger-button--compact"
                          type="button"
                          disabled={deletingId === module.id}
                          onClick={() => void handleDelete(module)}
                        >
                          {deletingId === module.id
                            ? 'Deleting...'
                            : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
