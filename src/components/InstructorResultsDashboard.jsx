import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import InstructorAttemptReview from './InstructorAttemptReview'
import {
  getInstructorAttempts,
  resetInstructorAttempts,
} from '../services/instructorResultsService'

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

function resultLabel(attempt) {
  if (attempt.status === 'in_progress') return 'In progress'
  if (attempt.passed == null) return attempt.status
  return attempt.passed ? 'Passed' : 'Failed'
}

function allSelected(ids, selectedIds) {
  return ids.length > 0 && ids.every((id) => selectedIds.includes(id))
}

function csvCell(value) {
  const text = value == null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function csvDate(value) {
  return value ? new Date(value).toISOString() : ''
}

function groupAttempts(attempts) {
  const classGroups = new Map()

  for (const attempt of attempts) {
    const classKey = attempt.classId || 'unassigned'

    if (!classGroups.has(classKey)) {
      classGroups.set(classKey, {
        classId: attempt.classId,
        className: attempt.className || 'Unassigned students',
        classCode: attempt.classCode,
        academicTerm: attempt.academicTerm,
        students: new Map(),
      })
    }

    const classGroup = classGroups.get(classKey)
    const studentKey =
      attempt.studentId ||
      attempt.studentEmail ||
      attempt.studentName

    if (!classGroup.students.has(studentKey)) {
      classGroup.students.set(studentKey, {
        studentId: attempt.studentId,
        studentName: attempt.studentName || 'Unnamed student',
        studentEmail:
          attempt.studentEmail || 'No email available',
        quizzes: new Map(),
      })
    }

    const studentGroup = classGroup.students.get(studentKey)
    const quizKey = attempt.quizId || attempt.quizTitle

    if (!studentGroup.quizzes.has(quizKey)) {
      studentGroup.quizzes.set(quizKey, {
        quizId: attempt.quizId,
        quizTitle: attempt.quizTitle,
        courseCode: attempt.courseCode,
        moduleCode: attempt.moduleCode,
        attempts: [],
      })
    }

    studentGroup.quizzes.get(quizKey).attempts.push(attempt)
  }

  return [...classGroups.values()]
    .map((classGroup) => ({
      ...classGroup,
      students: [...classGroup.students.values()]
        .map((studentGroup) => ({
          ...studentGroup,
          quizzes: [...studentGroup.quizzes.values()]
            .map((quizGroup) => ({
              ...quizGroup,
              attempts: quizGroup.attempts.sort((left, right) => {
                const leftDate = new Date(
                  left.startedAt || 0,
                ).getTime()
                const rightDate = new Date(
                  right.startedAt || 0,
                ).getTime()
                return rightDate - leftDate
              }),
            }))
            .sort((left, right) =>
              left.quizTitle.localeCompare(
                right.quizTitle,
                undefined,
                { sensitivity: 'base' },
              ),
            ),
        }))
        .sort((left, right) =>
          left.studentName.localeCompare(
            right.studentName,
            undefined,
            { sensitivity: 'base' },
          ),
        ),
    }))
    .sort((left, right) => {
      if (!left.classId) return 1
      if (!right.classId) return -1
      return left.className.localeCompare(
        right.className,
        undefined,
        { sensitivity: 'base' },
      )
    })
}

export default function InstructorResultsDashboard() {
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [courseFilter, setCourseFilter] = useState('all')
  const [quizFilter, setQuizFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedAttemptIds, setSelectedAttemptIds] = useState([])
  const [selectedAttemptId, setSelectedAttemptId] = useState(null)
  const [resetting, setResetting] = useState(false)

  const loadAttempts = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      setMessageIsError(false)

      const data = await getInstructorAttempts()
      setAttempts(data)
      setSelectedAttemptIds((current) =>
        current.filter((attemptId) =>
          data.some((attempt) => attempt.attemptId === attemptId),
        ),
      )

      if (
        data.length > 0 &&
        !Object.hasOwn(data[0], 'className')
      ) {
        setMessage(
          'Run migration 012_grouped_results_and_bulk_management.sql to enable class grouping and attempt resets.',
        )
        setMessageIsError(true)
      } else if (
        data.length > 0 &&
        !Object.hasOwn(data[0], 'eventCount')
      ) {
        setMessage(
          'Run migration 017_module_management_and_result_events.sql to display integrity-event counts.',
        )
        setMessageIsError(true)
      }
    } catch (error) {
      setMessage(
        `${error.message} Run migration 012_grouped_results_and_bulk_management.sql in Supabase if it has not been applied.`,
      )
      setMessageIsError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAttempts()
  }, [loadAttempts])

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

  const quizzes = useMemo(
    () =>
      [
        ...new Map(
          attempts.map((attempt) => [
            attempt.quizId,
            attempt.quizTitle,
          ]),
        ).entries(),
      ].sort((left, right) => left[1].localeCompare(right[1])),
    [attempts],
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
        attempt.quizTitle
          ?.toLowerCase()
          .includes(normalizedSearch) ||
        attempt.className
          ?.toLowerCase()
          .includes(normalizedSearch)

      const attemptClassId = attempt.classId || 'unassigned'
      const matchesClass =
        classFilter === 'all' ||
        attemptClassId === classFilter
      const matchesCourse =
        courseFilter === 'all' ||
        attempt.courseCode === courseFilter
      const matchesQuiz =
        quizFilter === 'all' ||
        attempt.quizId === quizFilter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'passed' &&
          attempt.passed === true) ||
        (statusFilter === 'failed' &&
          attempt.passed === false) ||
        attempt.status === statusFilter

      return (
        matchesSearch &&
        matchesClass &&
        matchesCourse &&
        matchesQuiz &&
        matchesStatus
      )
    })
  }, [
    attempts,
    classFilter,
    courseFilter,
    quizFilter,
    search,
    statusFilter,
  ])

  const resultsByClass = useMemo(
    () => groupAttempts(filteredAttempts),
    [filteredAttempts],
  )

  const visibleAttemptIds = useMemo(
    () => filteredAttempts.map((attempt) => attempt.attemptId),
    [filteredAttempts],
  )

  const metrics = useMemo(() => {
    const graded = attempts.filter(
      (attempt) => attempt.passed != null,
    )
    const passed = graded.filter((attempt) => attempt.passed)
    const average = graded.length
      ? graded.reduce(
          (sum, attempt) =>
            sum + Number(attempt.percentage),
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
    setSelectedAttemptIds((current) => {
      if (checked) {
        return [...new Set([...current, ...attemptIds])]
      }

      return current.filter(
        (attemptId) => !attemptIds.includes(attemptId),
      )
    })
  }

  function handleExportCsv() {
    if (!filteredAttempts.length) return

    const headers = [
      'Class Code',
      'Class Name',
      'Academic Term',
      'Student Name',
      'Student Email',
      'Course',
      'Module',
      'Quiz',
      'Attempt Number',
      'Status',
      'Raw Score',
      'Maximum Score',
      'Percentage',
      'Answered Items',
      'Question Count',
      'Integrity Events',
      'Started At',
      'Submitted At',
      'Time Used Seconds',
    ]

    const rows = filteredAttempts.map((attempt) => [
      attempt.classCode,
      attempt.className,
      attempt.academicTerm,
      attempt.studentName,
      attempt.studentEmail,
      attempt.courseCode,
      attempt.moduleCode,
      attempt.quizTitle,
      attempt.attemptNumber,
      resultLabel(attempt),
      Number(attempt.scorePoints),
      Number(attempt.maximumPoints),
      Number(attempt.percentage).toFixed(2),
      attempt.answeredCount,
      attempt.questionCount,
      Number(attempt.eventCount ?? 0),
      csvDate(attempt.startedAt),
      csvDate(attempt.submittedAt),
      attempt.timeUsedSeconds,
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

    link.href = downloadUrl
    link.download = `ccna-student-results-${timestamp}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(downloadUrl)
  }

  async function handleReset(attemptIds, description) {
    if (!attemptIds.length) return

    const confirmed = window.confirm(
      `Reset ${description}?\n\nThis permanently removes the selected attempt history, saved answers, scores, and integrity events. The student will be able to take the quiz again. This cannot be undone.`,
    )

    if (!confirmed) return

    setResetting(true)
    setMessage('')
    setMessageIsError(false)

    try {
      const deletedCount = await resetInstructorAttempts(
        attemptIds,
      )
      setSelectedAttemptIds((current) =>
        current.filter(
          (attemptId) => !attemptIds.includes(attemptId),
        ),
      )
      await loadAttempts()
      setMessage(
        `${deletedCount} ${
          Number(deletedCount) === 1 ? 'attempt was' : 'attempts were'
        } reset and removed from student history.`,
      )
      setMessageIsError(false)
    } catch (error) {
      setMessage(error.message)
      setMessageIsError(true)
    } finally {
      setResetting(false)
    }
  }

  if (selectedAttemptId) {
    return (
      <InstructorAttemptReview
        attemptId={selectedAttemptId}
        onBack={() => setSelectedAttemptId(null)}
      />
    )
  }

  return (
    <section className="instructor-results">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PHASE 1.6</span>
          <h2>Student results</h2>
          <p>
            Results are organized by class, student, quiz, and
            attempt.
          </p>
        </div>

        <div className="results-heading-actions">
          <button
            className="secondary"
            type="button"
            disabled={!filteredAttempts.length}
            onClick={handleExportCsv}
          >
            Export filtered CSV
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => void loadAttempts()}
          >
            Refresh results
          </button>
        </div>
      </div>

      <div className="results-metrics">
        <article>
          <span>Total attempts</span>
          <strong>{metrics.total}</strong>
        </article>
        <article>
          <span>Active now</span>
          <strong>{metrics.active}</strong>
        </article>
        <article>
          <span>Pass rate</span>
          <strong>{metrics.passRate.toFixed(1)}%</strong>
        </article>
        <article>
          <span>Average score</span>
          <strong>{metrics.average.toFixed(1)}%</strong>
        </article>
      </div>

      <div className="results-filters results-filters--with-class">
        <label>
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Class, student, email, or quiz"
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
          Quiz
          <select
            value={quizFilter}
            onChange={(event) =>
              setQuizFilter(event.target.value)
            }
          >
            <option value="all">All quizzes</option>
            {quizzes.map(([quizId, quizTitle]) => (
              <option key={quizId} value={quizId}>
                {quizTitle}
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
      </div>

      {!!visibleAttemptIds.length && (
        <div className="bulk-action-bar">
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
            Select all filtered attempts
          </label>

          <div className="bulk-action-bar__actions">
            <span>
              {selectedAttemptIds.length}{' '}
              {selectedAttemptIds.length === 1
                ? 'attempt'
                : 'attempts'}{' '}
              selected
            </span>
            <button
              className="danger-button"
              type="button"
              disabled={
                resetting || !selectedAttemptIds.length
              }
              onClick={() =>
                void handleReset(
                  selectedAttemptIds,
                  `${selectedAttemptIds.length} selected ${
                    selectedAttemptIds.length === 1
                      ? 'attempt'
                      : 'attempts'
                  }`,
                )
              }
            >
              {resetting
                ? 'Resetting...'
                : 'Reset selected'}
            </button>
          </div>
        </div>
      )}

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
        <p>Loading student results...</p>
      ) : !filteredAttempts.length ? (
        <div className="empty-state">
          <h3>No matching attempts</h3>
          <p>
            Student attempts will appear after a quiz has been
            started.
          </p>
        </div>
      ) : (
        <div className="class-result-groups">
          <p className="student-result-groups__summary">
            Showing {resultsByClass.length}{' '}
            {resultsByClass.length === 1 ? 'class' : 'classes'},{' '}
            {
              new Set(
                filteredAttempts.map(
                  (attempt) => attempt.studentId,
                ),
              ).size
            }{' '}
            students, and {filteredAttempts.length} attempts.
          </p>

          {resultsByClass.map((classGroup) => {
            const classAttemptIds = classGroup.students.flatMap(
              (student) =>
                student.quizzes.flatMap((quiz) =>
                  quiz.attempts.map(
                    (attempt) => attempt.attemptId,
                  ),
                ),
            )

            return (
              <section
                className="class-result-group"
                key={classGroup.classId || 'unassigned'}
              >
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
                      <span className="eyebrow">
                        {classGroup.classCode || 'NO CLASS'}
                      </span>
                      <strong>{classGroup.className}</strong>
                      <small>
                        {classGroup.academicTerm ||
                          'No academic term'}
                      </small>
                    </span>
                  </label>

                  <span className="status-chip">
                    {classGroup.students.length}{' '}
                    {classGroup.students.length === 1
                      ? 'student'
                      : 'students'}
                  </span>
                </header>

                <div className="class-result-group__students">
                  {classGroup.students.map((student) => {
                    const studentAttemptIds =
                      student.quizzes.flatMap((quiz) =>
                        quiz.attempts.map(
                          (attempt) => attempt.attemptId,
                        ),
                      )

                    return (
                      <article
                        className="student-result-group"
                        key={
                          student.studentId ||
                          student.studentEmail
                        }
                      >
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
                              {student.studentName
                                .charAt(0)
                                .toUpperCase()}
                            </span>

                            <span>
                              <strong>
                                {student.studentName}
                              </strong>
                              <small>
                                {student.studentEmail}
                              </small>
                            </span>
                          </label>

                          <span className="student-result-group__count">
                            {studentAttemptIds.length}{' '}
                            {studentAttemptIds.length === 1
                              ? 'attempt'
                              : 'attempts'}
                          </span>
                        </header>

                        <div className="student-result-group__quizzes">
                          {student.quizzes.map((quiz) => {
                            const quizAttemptIds =
                              quiz.attempts.map(
                                (attempt) =>
                                  attempt.attemptId,
                              )

                            return (
                              <section
                                className="student-quiz-result-group"
                                key={
                                  quiz.quizId ||
                                  quiz.quizTitle
                                }
                              >
                                <header className="student-quiz-result-group__header">
                                  <label className="bulk-select-control">
                                    <input
                                      type="checkbox"
                                      checked={allSelected(
                                        quizAttemptIds,
                                        selectedAttemptIds,
                                      )}
                                      onChange={(event) =>
                                        toggleAttempts(
                                          quizAttemptIds,
                                          event.target.checked,
                                        )
                                      }
                                    />
                                    <span>
                                      <strong>
                                        {quiz.quizTitle}
                                      </strong>
                                      <small>
                                        {quiz.courseCode}
                                        {quiz.moduleCode
                                          ? ` · ${quiz.moduleCode}`
                                          : ''}
                                      </small>
                                    </span>
                                  </label>

                                  <span className="status-chip">
                                    {quiz.attempts.length}{' '}
                                    {quiz.attempts.length === 1
                                      ? 'attempt'
                                      : 'attempts'}
                                  </span>
                                </header>

                                <div className="results-table-wrapper">
                                  <table className="results-table results-table--attempts">
                                    <thead>
                                      <tr>
                                        <th>Select</th>
                                        <th>Attempt</th>
                                        <th>Progress</th>
                                        <th>Score</th>
                                        <th>Events</th>
                                        <th>Result</th>
                                        <th>Started</th>
                                        <th>Submitted</th>
                                        <th>Actions</th>
                                      </tr>
                                    </thead>

                                    <tbody>
                                      {quiz.attempts.map(
                                        (attempt) => (
                                          <tr
                                            key={
                                              attempt.attemptId
                                            }
                                          >
                                            <td className="results-table__select">
                                              <input
                                                aria-label={`Select attempt ${attempt.attemptNumber} for ${quiz.quizTitle}`}
                                                type="checkbox"
                                                checked={selectedAttemptIds.includes(
                                                  attempt.attemptId,
                                                )}
                                                onChange={(
                                                  event,
                                                ) =>
                                                  toggleAttempts(
                                                    [
                                                      attempt.attemptId,
                                                    ],
                                                    event.target
                                                      .checked,
                                                  )
                                                }
                                              />
                                            </td>

                                            <td className="results-table__centered">
                                              <strong>
                                                #
                                                {
                                                  attempt.attemptNumber
                                                }
                                              </strong>
                                            </td>

                                            <td className="results-table__centered">
                                              <strong>
                                                {
                                                  attempt.answeredCount
                                                }{' '}
                                                /{' '}
                                                {
                                                  attempt.questionCount
                                                }
                                              </strong>
                                              <small>
                                                {formatDuration(
                                                  attempt.timeUsedSeconds,
                                                )}
                                              </small>
                                            </td>

                                            <td className="results-table__score">
                                              <strong>
                                                {Number(
                                                  attempt.scorePoints,
                                                )}{' '}
                                                /{' '}
                                                {Number(
                                                  attempt.maximumPoints,
                                                )}
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
                                                    attempt.eventCount ??
                                                      0,
                                                  ) > 0
                                                    ? 'result-event-count result-event-count--flagged'
                                                    : 'result-event-count'
                                                }
                                              >
                                                {Number(
                                                  attempt.eventCount ??
                                                    0,
                                                )}
                                              </span>
                                            </td>

                                            <td className="results-table__centered">
                                              <span
                                                className={[
                                                  'result-status',
                                                  attempt.status ===
                                                  'in_progress'
                                                    ? 'result-status--active'
                                                    : attempt.passed
                                                      ? 'result-status--passed'
                                                      : 'result-status--failed',
                                                ].join(' ')}
                                              >
                                                {resultLabel(
                                                  attempt,
                                                )}
                                              </span>
                                            </td>

                                            <td className="results-table__date">
                                              {formatDate(
                                                attempt.startedAt,
                                              )}
                                            </td>

                                            <td className="results-table__date">
                                              {formatDate(
                                                attempt.submittedAt,
                                              )}
                                            </td>

                                            <td className="results-table__action">
                                              <div className="row-action-buttons">
                                                <button
                                                  className="secondary"
                                                  type="button"
                                                  onClick={() =>
                                                    setSelectedAttemptId(
                                                      attempt.attemptId,
                                                    )
                                                  }
                                                >
                                                  Review
                                                </button>
                                                <button
                                                  className="danger-button danger-button--compact"
                                                  type="button"
                                                  disabled={
                                                    resetting
                                                  }
                                                  onClick={() =>
                                                    void handleReset(
                                                      [
                                                        attempt.attemptId,
                                                      ],
                                                      `attempt #${attempt.attemptNumber} for ${quiz.quizTitle}`,
                                                    )
                                                  }
                                                >
                                                  Reset
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ),
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </section>
                            )
                          })}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
