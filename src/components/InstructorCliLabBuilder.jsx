import CliPracticalConfigurationFields from './CliPracticalConfigurationFields'
import useCliPracticalEditor from '../hooks/useCliPracticalEditor'
import {blankLab,normalizeCriterionForDevice,criterionConfigurationCommands,criterionRequiredState,criterionTypeLabels} from '../../supabase/functions/_shared/cliPracticalConfiguration.js'
import useDataLoadState from '../hooks/useDataLoadState'
import DataLoadBoundary from './DataLoadBoundary'
import LibraryItemDialog from './LibraryItemDialog'
import AssessmentReviewPolicy from './AssessmentReviewPolicy'
import ReviewScheduleFields from './ReviewScheduleFields'
import useAssessmentReviewSchedule from '../hooks/useAssessmentReviewSchedule'
import { reviewScheduleToPolicy, validateReviewSchedule } from '../services/reviewSchedule'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCourses, getModules } from '../services/questionService'
import CliPracticalTemplateManager from './CliPracticalTemplateManager'
import useInstructorSubsection from '../hooks/useInstructorSubsection'
import WorkspaceSubsectionNav from './WorkspaceSubsectionNav'
import {
  bulkManageCliLabs,
  duplicateInstructorCliLab,
  deleteCliLab,
  getInstructorCliWorkspace,
  getInstructorCliLabTemplates,
  saveCliLabAsTemplate,
  saveCliLab,
} from '../services/cliLabService'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import {
  ActionBar,
  ResponsiveGrid,
  SectionHeader,
  SurfaceCard,
} from './LayoutPrimitives'


export default function InstructorCliLabBuilder({ administratorMode = false }) {
  const [activeSection, setActiveSection] = useInstructorSubsection('cli-practicals', administratorMode)
  const [workspace, setWorkspace] = useState({ labs: [], classes: [] })
  const [templates, setTemplates] = useState([])
  const [courses, setCourses] = useState([])
  const [modules, setModules] = useState([])
  const [lab, setLab] = useState(blankLab)
  const reviewSchedule = useAssessmentReviewSchedule('cli', lab.id)
  const [loading, setLoading, hasLoaded, markLoaded] = useDataLoadState()
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const editor=useCliPracticalEditor(lab,setLab)
  const {setCriterionDeviceSelection,setDeviceEditorSelection,setExpandedCriterionIndex,setExpandedCriterionDeviceIds,setSelectedPreset,toggleClass}=editor
  const [selectedLabIds, setSelectedLabIds] = useState([])
  const [bulkLabAction, setBulkLabAction] = useState('')
  const [rowLabActions, setRowLabActions] = useState({})
  const [bulkManaging, setBulkManaging] = useState(false)
  const [managingLabId, setManagingLabId] = useState(null)
  const [duplicatingLabId, setDuplicatingLabId] = useState(null)
  const [templatingLabId, setTemplatingLabId] = useState(null)
  const [answerKeyLabId, setAnswerKeyLabId] = useState(null)
  const [detailsLabId, setDetailsLabId] = useState(null)
  const [expandedCourseIds, setExpandedCourseIds] = useState([])
  const { confirm, confirmationDialog } = useConfirmationDialog()
  useEffect(() => {
    if (activeSection !== 'library') {
      setDetailsLabId(null)
      setAnswerKeyLabId(null)
    }
  }, [activeSection])

  const practicalCourseGroups = useMemo(() => {
    const groups = new Map()

    workspace.labs.forEach((item) => {
      const courseId = String(item.courseId ?? 'uncategorized')
      const course = courses.find(
        (courseItem) => String(courseItem.id) === courseId,
      )
      if (!groups.has(courseId)) {
        groups.set(courseId, {
          id: courseId,
          code: item.courseCode || course?.code || 'OTHER',
          title: course?.title || 'Uncategorized practicals',
          labs: [],
        })
      }
      groups.get(courseId).labs.push(item)
    })

    const courseOrder = { ITN: 1, SRWE: 2, ENSA: 3 }
    return [...groups.values()].sort(
      (left, right) =>
        (courseOrder[left.code] ?? 999) - (courseOrder[right.code] ?? 999)
        || left.code.localeCompare(right.code, undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
    )
  }, [courses, workspace.labs])

  const loadData = useCallback(async () => {
    setLoadFailed(false)
    try {
      setLoading(true)
      setMessage('')
      const [workspaceData, courseData, templateData] = await Promise.all([
        getInstructorCliWorkspace(),
        getCourses(),
        getInstructorCliLabTemplates(),
      ])
      setWorkspace(workspaceData)
      setCourses(courseData)
      setTemplates(templateData)
      markLoaded()
      setSelectedLabIds((current) =>
        current.filter((id) => workspaceData.labs.some((item) => item.id === id)),
      )
      setDetailsLabId((current) => workspaceData.labs.some((item) => item.id === current) ? current : null)
    } catch (error) {
      setLoadFailed(true)
      setMessage(
        `${error.message} Run database migration 020 if it has not been applied.`,
      )
    } finally {
      setLoading(false)
    }
  }, [markLoaded, setLoading])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const courseIds = practicalCourseGroups.map((course) => course.id)
    setExpandedCourseIds((current) =>
      current.filter((id) => courseIds.includes(id)),
    )
  }, [practicalCourseGroups])

  async function loadCourseModules(courseId) {
    setModules(courseId ? await getModules(courseId) : [])
  }

  async function editLab(item) {
    const emptyLab = blankLab()
    const devices = item.devices?.length
      ? item.devices
      : emptyLab.devices
    const primaryDeviceId = devices[0].id

    setLab({
      ...emptyLab,
      ...item,
      devices,
      topology: item.topology ?? { links: [] },
      criteria: item.criteria.map((criterion) => {
        const deviceId = criterion.deviceId
          ?? item.devices?.[0]?.id
          ?? primaryDeviceId
        const deviceType = devices.find(
          (device) => device.id === deviceId,
        )?.type ?? devices[0]?.type ?? 'switch'
        return normalizeCriterionForDevice(
          criterion,
          deviceType,
          deviceId,
        )
      }),
    })
    await loadCourseModules(String(item.courseId))
    setExpandedCriterionIndex(0)
    setExpandedCriterionDeviceIds([primaryDeviceId])
    setDeviceEditorSelection(primaryDeviceId)
    setCriterionDeviceSelection(primaryDeviceId)
    setSelectedPreset('')
    setActiveSection('editor')
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!reviewSchedule.ready) {
      setMessage('Load review settings before saving this practical.')
      return
    }
    const reviewError = validateReviewSchedule(reviewSchedule.value)
    if (reviewError) {
      setMessage(reviewError)
      return
    }
    const incompleteDevice = lab.devices.find(
      (device) => !device.label.trim() || !device.hostname.trim(),
    )
    if (lab.status === 'published' && incompleteDevice) {
      setDeviceEditorSelection(incompleteDevice.id)
      window.requestAnimationFrame(() => document.getElementById('cli-device-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      setMessage(
        'Enter a display label and starting hostname for every device before publishing.',
      )
      return
    }

    setSaving(true)
    setMessage('')
    try {
      await saveCliLab({
        ...lab,
        reviewPolicy: reviewScheduleToPolicy(reviewSchedule.value),
        durationMinutes: Number(lab.durationMinutes),
        maxAttempts: Number(lab.maxAttempts),
        passingScore: Number(lab.passingScore),
        criteria: lab.criteria.map((criterion) => ({
          ...criterion,
          points: Number(criterion.points),
        })),
      })
      const emptyLab = blankLab()
      setLab(emptyLab)
      reviewSchedule.reset()
      setCriterionDeviceSelection('')
      setDeviceEditorSelection('')
      setModules([])
      setExpandedCriterionIndex(0)
      setExpandedCriterionDeviceIds([emptyLab.devices[0].id])
      setSelectedPreset('')
      await loadData()
      setActiveSection('library')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    const confirmed = await confirm({
      title: 'Delete CLI practical?',
      message: `Delete “${item.title}” and all of its practical attempts, command logs, scores, and integrity events? This action cannot be undone.`,
      confirmLabel: 'Delete practical',
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      await deleteCliLab(item.id)
      await loadData()
    } catch (error) {
      setMessage(error.message)
    }
  }

  async function handleDuplicateLab(item) {
    const confirmed = await confirm({
      title: 'Duplicate CLI practical?',
      message: `Create a draft copy of “${item.title}”? Class assignments, attempts, commands, and results will not be copied.`,
      confirmLabel: 'Duplicate practical',
      tone: 'default',
    })
    if (!confirmed) return

    setDuplicatingLabId(item.id)
    setMessage('')
    try {
      await duplicateInstructorCliLab(item.id)
      await loadData()
      setMessage('A draft copy of the CLI practical was created.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setDuplicatingLabId(null)
    }
  }

  async function handleSaveLabTemplate(item) {
    const confirmed = await confirm({
      title: 'Save practical as template?',
      message: `Save the devices, topology, settings, and criteria from “${item.title}” as a reusable template?`,
      confirmLabel: 'Save template',
      tone: 'default',
    })
    if (!confirmed) return

    setTemplatingLabId(item.id)
    setMessage('')
    try {
      await saveCliLabAsTemplate(item.id)
      await loadData()
      setMessage('The CLI practical template was saved.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setTemplatingLabId(null)
    }
  }

  function toggleLabSelection(labId) {
    setSelectedLabIds((current) =>
      current.includes(labId)
        ? current.filter((id) => id !== labId)
        : [...current, labId],
    )
  }

  function closeLabDetails() {
    setDetailsLabId(null)
    setAnswerKeyLabId(null)
  }

  function togglePracticalCourse(courseId) {
    setExpandedCourseIds((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId],
    )
  }

  function toggleCourseLabSelection(labIds, checked) {
    setSelectedLabIds((current) =>
      checked
        ? [...new Set([...current, ...labIds])]
        : current.filter((id) => !labIds.includes(id)),
    )
  }

  function toggleAllLabs() {
    setSelectedLabIds((current) =>
      workspace.labs.length > 0
      && workspace.labs.every((item) => current.includes(item.id))
        ? []
        : workspace.labs.map((item) => item.id),
    )
  }

  async function handleBulkLabAction() {
    if (!selectedLabIds.length || !bulkLabAction) {
      setMessage('Select one or more practicals and choose a bulk action.')
      return
    }

    if (bulkLabAction === 'delete') {
      const confirmed = await confirm({
        title: `Delete ${selectedLabIds.length} selected practicals?`,
        message:
          'All related attempts, command logs, scores, and integrity events will also be removed. This action cannot be undone.',
        confirmLabel: 'Delete selected',
        tone: 'danger',
      })
      if (!confirmed) return
    }

    try {
      setBulkManaging(true)
      setMessage('')
      const affectedCount = await bulkManageCliLabs(selectedLabIds, bulkLabAction)
      const completedAction = {
        publish: 'published',
        unpublish: 'unpublished',
        delete: 'deleted',
      }[bulkLabAction]

      setSelectedLabIds([])
      setBulkLabAction('')
      await loadData()
      setMessage(`${affectedCount} practical(s) ${completedAction}.`)
    } catch (error) {
      setMessage(
        `${error.message} Run migration 028_bulk_cli_lab_management.sql if it has not been applied.`,
      )
    } finally {
      setBulkManaging(false)
    }
  }

  async function handleRowLabAction(item) {
    const action = rowLabActions[item.id]
    if (!action) return

    setManagingLabId(item.id)
    setMessage('')
    try {
      if (action === 'delete') {
        await handleDelete(item)
      } else {
        await bulkManageCliLabs([item.id], action)
        await loadData()
        setMessage(
          `“${item.title}” was ${action === 'publish' ? 'published' : 'unpublished'}.`,
        )
      }
      setRowLabActions((current) => ({
        ...current,
        [item.id]: '',
      }))
    } catch (error) {
      setMessage(
        `${error.message} Run migration 028_bulk_cli_lab_management.sql if it has not been applied.`,
      )
    } finally {
      setManagingLabId(null)
    }
  }

  return (
    <div className="cli-lab-builder">
      {confirmationDialog}
      <WorkspaceSubsectionNav page="cli-practicals" activeSection={activeSection} onChange={setActiveSection} />
      {message && <p className="form-message" role="status" aria-live="polite">{message}</p>}
      <div id="cli-practicals-subsection-editor" className="workspace-subsection-panel" hidden={activeSection !== 'editor'}>
      <section className="cli-lab-panel">
        <SectionHeader
          className="section-heading"
          eyebrow="CLI CONTENT"
          title="CLI practical builder"
          description="Create single-device or topology-based Cisco IOS exams and grade final configuration state."
          actions={(
              <button
              className="primary"
              type="button"
              onClick={() => {
                const emptyLab = blankLab()
                setLab(emptyLab)
                reviewSchedule.reset()
                setCriterionDeviceSelection('')
                setDeviceEditorSelection('')
                setModules([])
                setExpandedCriterionIndex(0)
                setExpandedCriterionDeviceIds([emptyLab.devices[0].id])
                setSelectedPreset('')
                setActiveSection('editor')
              }}
            >
              New practical
            </button>
          )}
        />

          <DataLoadBoundary error={loadFailed} onRetry={loadData} loading={loading} ready={hasLoaded} label="Loading practical builder...">
          <form className="cli-lab-editor" onSubmit={handleSave}>
            <CliPracticalConfigurationFields lab={lab} setLab={setLab} courses={courses} modules={modules} loadCourseModules={loadCourseModules} editor={editor} />

            <fieldset className="cli-class-assignments form-fieldset">
              <legend>Assign to classes</legend>
              {!workspace.classes.length ? <p>Create an active class first.</p> :
                workspace.classes.map((item) => (
                  <label key={item.id}>
                    <input type="checkbox" checked={lab.classIds.includes(item.id)}
                      onChange={() => toggleClass(item.id)} />
                    <span><strong>{item.code}</strong> — {item.name}</span>
                  </label>
                ))}
            </fieldset>

            {reviewSchedule.loading && <p role="status">Loading review settings...</p>}
            {reviewSchedule.error && <div role="alert"><p>{reviewSchedule.error}</p><button className="secondary" type="button" onClick={() => void reviewSchedule.retry()}>Reload review settings</button></div>}
            <ReviewScheduleFields value={reviewSchedule.value} onChange={reviewSchedule.setValue} disabled={saving || !reviewSchedule.ready} />

            <ActionBar className="form-actions">
              <button className="primary" type="submit" disabled={saving || !reviewSchedule.ready}>
                {saving ? 'Saving...' : lab.id ? 'Save practical' : 'Create practical'}
              </button>
              <button className="secondary" type="button" onClick={() => {
                const emptyLab = blankLab()
                setLab(emptyLab)
                reviewSchedule.reset()
                setCriterionDeviceSelection('')
                setDeviceEditorSelection('')
                setModules([])
                setExpandedCriterionIndex(0)
                setExpandedCriterionDeviceIds([emptyLab.devices[0].id])
                setSelectedPreset('')
                setActiveSection('library')
              }}>Cancel</button>
            </ActionBar>
          </form>
          </DataLoadBoundary>
      </section>
      </div>
      <div id="cli-practicals-subsection-templates" className="workspace-subsection-panel" hidden={activeSection !== 'templates'}>
      {!hasLoaded && <section className="cli-lab-panel"><SectionHeader title="Practical templates" /><DataLoadBoundary error={loadFailed} onRetry={loadData} loading={loading} ready={false} label="Loading practical templates..." /></section>}
      {hasLoaded && (
      <DataLoadBoundary loading={loading} ready error={loadFailed} onRetry={loadData}>
      <CliPracticalTemplateManager
        templates={templates}
        onChanged={loadData}
      />
      </DataLoadBoundary>
      )}
      </div>
      <div id="cli-practicals-subsection-library" className="workspace-subsection-panel" hidden={activeSection !== 'library'}>
      <section className="cli-lab-panel">
        <SectionHeader
          className="section-heading"
          eyebrow="CLI CONTENT"
          title="Practical library"
          actions={(
            <div className="loading-panel-actions"><span className="status-chip">{hasLoaded ? workspace.labs.length : '—'} practicals</span></div>
          )}
        />
        <DataLoadBoundary error={loadFailed} onRetry={loadData} loading={loading} ready={hasLoaded} label="Loading CLI practicals...">
        {!workspace.labs.length ? (
          <div className="empty-state"><h3>No CLI practicals yet</h3><p>Create the first single-device lab.</p></div>
        ) : (
          <div className="cli-library-content">
            <ActionBar className="cli-library-bulk-toolbar">
              <label className="cli-library-select-all">
                <input
                  type="checkbox"
                  checked={
                    workspace.labs.length > 0
                    && workspace.labs.every((item) => selectedLabIds.includes(item.id))
                  }
                  onChange={toggleAllLabs}
                />
                <span>Select all practicals</span>
              </label>
              <span className="cli-library-selected-count">
                {selectedLabIds.length} selected
              </span>
              <div className="cli-library-bulk-actions cli-library-action-control">
                <select
                  aria-label="Bulk practical action"
                  value={bulkLabAction}
                  onChange={(event) => setBulkLabAction(event.target.value)}
                >
                  <option value="">Choose action</option>
                  <option value="publish">Publish</option>
                  <option value="unpublish">Unpublish</option>
                  <option value="delete">Delete</option>
                </select>
                <button
                  className={bulkLabAction === 'delete' ? 'danger-button' : 'primary'}
                  type="button"
                  disabled={!selectedLabIds.length || !bulkLabAction || bulkManaging}
                  onClick={() => void handleBulkLabAction()}
                >
                  {bulkManaging ? 'Applying...' : 'OK'}
                </button>
              </div>
            </ActionBar>
            <div className="cli-practical-course-groups">
            {practicalCourseGroups.map((course) => {
              const courseExpanded = expandedCourseIds.includes(course.id)
              const coursePanelId = `cli-course-panel-${course.id}`
              const courseLabIds = course.labs.map((item) => item.id)
              const allCourseLabsSelected =
                courseLabIds.length > 0
                && courseLabIds.every((id) => selectedLabIds.includes(id))

              return (
                <SurfaceCard
                  as="section"
                  subtle
                  className="cli-practical-course-group"
                  key={course.id}
                >
                  <header className="cli-practical-course-group__header">
                    <div className="cli-practical-course-group__summary">
                      <div className="cli-practical-course-group__identity">
                        <span className="course-code">{course.code}</span>
                        <div>
                          <h3>{course.title}</h3>
                          <small>
                            {course.labs.length}{' '}
                            {course.labs.length === 1
                              ? 'practical'
                              : 'practicals'}
                          </small>
                        </div>
                      </div>
                      <label className="bulk-select-control">
                        <input
                          type="checkbox"
                          checked={allCourseLabsSelected}
                          disabled={bulkManaging}
                          onChange={(event) =>
                            toggleCourseLabSelection(
                              courseLabIds,
                              event.target.checked,
                            )
                          }
                        />
                        Select all in {course.code}
                      </label>
                    </div>
                    <button
                      className="module-collapse-button"
                      type="button"
                      aria-expanded={courseExpanded}
                      aria-controls={coursePanelId}
                      onClick={() => togglePracticalCourse(course.id)}
                    >
                      {courseExpanded
                        ? 'Hide practicals'
                        : 'Show practicals'}
                    </button>
                  </header>
                  {courseExpanded && (
                    <ResponsiveGrid
                      className="cli-lab-grid"
                      id={coursePanelId}
                      min="24rem"
                    >
            {course.labs.map((item) => {
              return (
              <SurfaceCard
                as="article"
                subtle
                className="cli-lab-card library-assessment-card"
                key={item.id}
              >
                <div className="library-card__summary">
                  <h3>{item.title}</h3>
                  <button className="secondary" type="button" onClick={() => setDetailsLabId(item.id)}>Show details</button>
                </div>
                <LibraryItemDialog open={activeSection === 'library' && detailsLabId === item.id} title={item.title} onClose={closeLabDetails}>
                {message && <p className="form-message form-message--error" role="alert">{message}</p>}
                <header>
                  <label className="cli-lab-select">
                    <input
                      type="checkbox"
                      checked={selectedLabIds.includes(item.id)}
                      onChange={() => toggleLabSelection(item.id)}
                    />
                    <span>Select</span>
                  </label>
                  <div className="cli-lab-card__badges">
                    <span className="course-code">{item.courseCode}</span>
                    <span className={`content-status content-status--${item.status}`}>{item.status}</span>
                  </div>
                </header>
                <p>{item.moduleCode || 'All modules'} · {item.deviceType}</p>
                <p>{item.description || 'No description provided.'}</p>
                <div className="cli-lab-card__details">
                <dl>
                  <div><dt>Duration</dt><dd>{item.durationMinutes} minutes</dd></div>
                  <div><dt>Criteria</dt><dd>{item.criteria.length}</dd></div>
                  <div><dt>Classes</dt><dd>{item.classIds.length}</dd></div>
                  <div><dt>Attempts</dt><dd>{item.maxAttempts}</dd></div>
                </dl>
                <AssessmentReviewPolicy assessmentType="cli" assessmentId={item.id} />
                <div className="cli-lab-card__reuse-actions">
                  <button
                    className="secondary"
                    type="button"
                    disabled={duplicatingLabId === item.id}
                    onClick={() => void handleDuplicateLab(item)}
                  >
                    {duplicatingLabId === item.id
                      ? 'Duplicating...'
                      : 'Duplicate draft'}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={templatingLabId === item.id}
                    onClick={() => void handleSaveLabTemplate(item)}
                  >
                    {templatingLabId === item.id
                      ? 'Saving...'
                      : 'Save as template'}
                  </button>
                </div>
                <div className="class-card__actions">
                  <button
                    className="secondary"
                    type="button"
                    aria-expanded={answerKeyLabId === item.id}
                    onClick={() =>
                      setAnswerKeyLabId((current) =>
                        current === item.id ? null : item.id
                      )
                    }
                  >
                    {answerKeyLabId === item.id
                      ? 'Hide answer key'
                      : 'Show answer key'}
                  </button>
                  <button className="primary" type="button" onClick={() => { closeLabDetails(); void editLab(item) }}>Edit</button>
                </div>
                <div className="cli-library-action-control">
                  <select
                    aria-label={`Action for ${item.title}`}
                    value={rowLabActions[item.id] ?? ''}
                    disabled={managingLabId === item.id || bulkManaging}
                    onChange={(event) =>
                      setRowLabActions((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Choose action</option>
                    <option value="publish">Publish</option>
                    <option value="unpublish">Unpublish</option>
                    <option value="delete">Delete</option>
                  </select>
                  <button
                    className={
                      rowLabActions[item.id] === 'delete'
                        ? 'danger-button'
                        : 'primary'
                    }
                    type="button"
                    disabled={
                      managingLabId === item.id
                      || bulkManaging
                      || !rowLabActions[item.id]
                    }
                    onClick={() => void handleRowLabAction(item)}
                  >
                    {managingLabId === item.id ? 'Working...' : 'OK'}
                  </button>
                </div>
                {answerKeyLabId === item.id && (
                  <section className="cli-answer-key">
                    <div className="cli-answer-key__heading">
                      <div>
                        <span className="eyebrow">INSTRUCTOR ONLY</span>
                        <h4>Answer key</h4>
                      </div>
                      <strong>
                        {(item.criteria ?? []).reduce(
                          (total, criterion) =>
                            total + (Number(criterion.points) || 0),
                          0,
                        )}{' '}
                        points
                      </strong>
                    </div>
                    <p className="cli-answer-key__note">
                      Students may use any valid command order. Grading checks
                      the final configuration against these requirements.
                    </p>
                    <ol className="cli-answer-key__criteria">
                      {(item.criteria ?? []).map((criterion, index) => (
                        <li
                          key={`${item.id}-${criterion.type}-${index}`}
                          className="cli-answer-key__criterion"
                        >
                          <div className="cli-answer-key__criterion-heading">
                            <strong>
                              {criterionTypeLabels[criterion.type]
                                ?? criterion.type}
                            </strong>
                            <span>{Number(criterion.points) || 0} points</span>
                          </div>
                          <dl>
                            {criterion.target?.trim() && (
                              <div>
                                <dt>Target</dt>
                                <dd>{criterion.target.trim()}</dd>
                              </div>
                            )}
                            <div>
                              <dt>
                                {criterion.expected?.trim()
                                  ? 'Expected'
                                  : 'Required state'}
                              </dt>
                              <dd>
                                {criterion.expected?.trim()
                                  || criterionRequiredState(criterion.type)}
                              </dd>
                            </div>
                          </dl>
                          <div className="cli-answer-key__commands">
                            <span>Required configuration</span>
                            <pre>
                              <code>{criterionConfigurationCommands(
                                  criterion,
                                  item.criteria ?? [],
                                  (item.devices ?? []).find(
                                    (device) => device.id === criterion.deviceId,
                                  )?.type ?? item.deviceType,
                                ).join('\n')}</code>
                            </pre>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                  </div>
                </LibraryItemDialog>
              </SurfaceCard>
              )
            })}
                    </ResponsiveGrid>
                  )}
                </SurfaceCard>
              )
            })}
            </div>
          </div>
        )}
        </DataLoadBoundary>
      </section>
      </div>
    </div>
  )
}
