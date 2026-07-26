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
}

function compareModuleCodes(left, right) {
  return left.code.localeCompare(right.code, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

const courseDisplayOrder = {
  ITN: 1,
  SRWE: 2,
  ENSA: 3,
}

function compareCourses(left, right) {
  const leftOrder = courseDisplayOrder[left.code] ?? 999
  const rightOrder = courseDisplayOrder[right.code] ?? 999

  return (
    leftOrder - rightOrder ||
    left.code.localeCompare(right.code, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  )
}

export default function InstructorModuleManager({ onChanged }) {
  const [workspace, setWorkspace] = useState({
    courses: [],
    modules: [],
  })

  const [form, setForm] = useState(emptyForm)

  // Course IDs stored here are currently expanded.
  // Starting with an empty array makes every course collapsed initially.
  const [expandedCourseIds, setExpandedCourseIds] = useState([])

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

      const nextWorkspace = await getInstructorModuleWorkspace()
      setWorkspace(nextWorkspace)
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
      workspace.courses
        .map((course) => ({
          ...course,
          modules: workspace.modules
            .filter(
              (module) =>
                String(module.course_id) === String(course.id),
            )
            .sort(compareModuleCodes),
        }))
        .sort(compareCourses),
    [workspace],
  )

  function isCourseExpanded(courseId) {
    return expandedCourseIds.includes(String(courseId))
  }

  function expandCourse(courseId) {
    const normalizedCourseId = String(courseId)

    setExpandedCourseIds((current) => {
      if (current.includes(normalizedCourseId)) {
        return current
      }

      return [...current, normalizedCourseId]
    })
  }

  function toggleCourse(course) {
    const courseId = String(course.id)
    const currentlyExpanded = isCourseExpanded(courseId)

    setExpandedCourseIds((current) => {
      if (currentlyExpanded) {
        return current.filter((id) => id !== courseId)
      }

      return [...current, courseId]
    })

    // Avoid leaving a hidden editor open when collapsing its course.
    if (currentlyExpanded && form.courseId === courseId) {
      setForm(emptyForm)
      setMessage('')
      setMessageIsError(false)
    }
  }

  function closeEditor() {
    setForm(emptyForm)
    setMessage('')
    setMessageIsError(false)
  }

  function startAdd(course) {
    // Keep only the course being edited expanded.
    setExpandedCourseIds([String(course.id)])

    setForm({
      ...emptyForm,
      courseId: String(course.id),
      code: `${course.code}-`,
    })

    setMessage('')
    setMessageIsError(false)
  }

  function startEdit(module) {
    expandCourse(module.course_id)

    setForm({
      id: module.id,
      courseId: String(module.course_id),
      code: module.code,
      title: module.title,
      description: module.description ?? '',
    })

    setMessage('')
    setMessageIsError(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const wasEditing = Boolean(form.id)
    const affectedCourseId = form.courseId

    setSaving(true)
    setMessage('')
    setMessageIsError(false)

    try {
      await saveInstructorModule(form)

      setForm(emptyForm)
      expandCourse(affectedCourseId)

      await loadWorkspace()
      await onChanged?.()

      setMessage(
        wasEditing ? 'Module updated.' : 'Module created.',
      )
    } catch (error) {
      setMessage(error.message)
      setMessageIsError(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(module) {
    const confirmed = window.confirm(
      `Delete module "${module.code} - ${module.title}"?`,
    )

    if (!confirmed) {
      return
    }

    setDeletingId(module.id)
    setMessage('')
    setMessageIsError(false)

    try {
      await deleteInstructorModule(module.id)

      if (form.id === module.id) {
        setForm(emptyForm)
      }

      expandCourse(module.course_id)

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
            Expand a course to view and manage its modules. Modules are
            displayed automatically by module code.
          </p>
        </div>

        <span className="status-chip module-total-badge">
          {workspace.modules.length}{' '}
          {workspace.modules.length === 1 ? 'module' : 'modules'}
        </span>
      </div>

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
          {modulesByCourse.map((course) => {
            const courseId = String(course.id)
            const expanded = isCourseExpanded(courseId)
            const editorIsOpen = form.courseId === courseId
            const panelId = `course-module-panel-${courseId}`

            return (
              <article
                className={[
                  'module-course-group',
                  expanded
                    ? 'module-course-group--expanded'
                    : 'module-course-group--collapsed',
                  editorIsOpen
                    ? 'module-course-group--editing'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={course.id}
              >
                <header>
                  <div className="module-course-group__identity">
                    <span className="course-code">{course.code}</span>
                    <h3>{course.title}</h3>
                  </div>

                  <div className="module-course-group__controls">
                    <div className="module-course-group__meta">
                      <span className="status-chip">
                        {course.modules.length}{' '}
                        {course.modules.length === 1
                          ? 'module'
                          : 'modules'}
                      </span>

                      <button
                        className="module-collapse-button"
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => toggleCourse(course)}
                      >
                        <span
                          className={[
                            'module-collapse-button__icon',
                            expanded
                              ? 'module-collapse-button__icon--expanded'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-hidden="true"
                        >
                          ▾
                        </span>

                        <span>{expanded ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>

                    <button
                      className="primary module-add-button"
                      type="button"
                      disabled={editorIsOpen}
                      onClick={() => startAdd(course)}
                    >
                      Add module
                    </button>
                  </div>
                </header>

                {expanded && (
                  <div
                    className="module-course-group__content"
                    id={panelId}
                  >
                    {editorIsOpen && (
                      <form
                        className="module-editor module-editor--embedded"
                        onSubmit={handleSubmit}
                      >
                        <div className="module-editor__heading">
                          <div>
                            <strong>
                              {form.id
                                ? 'Edit module'
                                : 'Add module'}
                            </strong>

                            <small>
                              {course.code} — {course.title}
                            </small>
                          </div>

                          <button
                            className="module-editor__close"
                            type="button"
                            aria-label="Close module form"
                            onClick={closeEditor}
                          >
                            ×
                          </button>
                        </div>

                        <div className="form-grid">
                          <label>
                            Module code

                            <input
                              required
                              value={form.code}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  code: event.target.value.toUpperCase(),
                                }))
                              }
                              placeholder={`Example: ${course.code}-06`}
                            />

                            <small>
                              The number in the code controls display
                              order.
                            </small>
                          </label>

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
                              placeholder="Example: Ethernet Switching"
                            />
                          </label>
                        </div>

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
                          <button
                            className="primary"
                            type="submit"
                            disabled={saving}
                          >
                            {saving
                              ? 'Saving...'
                              : form.id
                                ? 'Save module'
                                : 'Add module'}
                          </button>

                          <button
                            className="secondary"
                            type="button"
                            disabled={saving}
                            onClick={closeEditor}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    {!course.modules.length ? (
                      <p className="muted-copy">
                        No modules added yet.
                      </p>
                    ) : (
                      <div className="module-list">
                        {course.modules.map((module) => (
                          <div
                            className="module-list__row"
                            key={module.id}
                          >
                            <div>
                              <strong>{module.code}</strong>
                              <span>{module.title}</span>

                              {module.description && (
                                <small>
                                  {module.description}
                                </small>
                              )}
                            </div>

                            <div className="module-list__actions">
                              <button
                                className="secondary"
                                type="button"
                                disabled={editorIsOpen}
                                onClick={() => startEdit(module)}
                              >
                                Edit
                              </button>

                              <button
                                className="danger-button danger-button--compact"
                                type="button"
                                disabled={
                                  editorIsOpen ||
                                  deletingId === module.id
                                }
                                onClick={() =>
                                  void handleDelete(module)
                                }
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
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
