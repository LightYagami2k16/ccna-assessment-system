import { useCallback, useEffect, useState } from 'react'
import { getCourses, getModules } from '../services/questionService'
import {
  deleteCliLab,
  getInstructorCliWorkspace,
  saveCliLab,
} from '../services/cliLabService'

const criterionTypes = [
  ['hostname', 'Hostname'],
  ['enable_secret', 'Enable secret'],
  ['password_encryption', 'Service password encryption enabled'],
  ['banner_motd', 'Message-of-the-day banner'],
  ['domain_name', 'IP domain name'],
  ['local_user', 'Local username and secret'],
  ['line_password', 'Console or VTY password'],
  ['line_login', 'Console or VTY login enabled'],
  ['line_transport_input', 'VTY transport input'],
  ['vlan_exists', 'VLAN exists'],
  ['vlan_name', 'VLAN name'],
  ['interface_mode', 'Interface switchport mode'],
  ['interface_description', 'Interface description'],
  ['interface_access_vlan', 'Interface access VLAN'],
  ['interface_voice_vlan', 'Interface voice VLAN'],
  ['interface_trunk_native_vlan', 'Trunk native VLAN'],
  ['interface_trunk_allowed_vlans', 'Trunk allowed VLANs'],
  ['interface_enabled', 'Interface enabled'],
  ['interface_ip', 'Interface IP address'],
  ['config_saved', 'Configuration saved'],
]

const targetNotRequired = [
  'hostname',
  'enable_secret',
  'password_encryption',
  'banner_motd',
  'domain_name',
  'config_saved',
]

const expectedNotRequired = [
  'password_encryption',
  'line_login',
  'vlan_exists',
  'interface_enabled',
  'config_saved',
]

function blankCriterion() {
  return { type: 'hostname', target: '', expected: '', points: 10 }
}

function blankLab() {
  return {
    id: '',
    courseId: '',
    moduleId: '',
    title: '',
    description: '',
    instructions: '',
    deviceType: 'switch',
    initialHostname: 'Switch',
    durationMinutes: 30,
    maxAttempts: 1,
    passingScore: 70,
    status: 'draft',
    classIds: [],
    criteria: [blankCriterion()],
  }
}

function criterionHelp(type) {
  if (type === 'hostname') return 'Expected value: SW1'
  if (type === 'enable_secret') return 'Expected value: the required enable secret'
  if (type === 'password_encryption') return 'Checks whether service password-encryption is enabled'
  if (type === 'banner_motd') return 'Expected value: banner text without delimiter characters'
  if (type === 'domain_name') return 'Expected value: example.edu'
  if (type === 'local_user') return 'Target: username; expected: secret'
  if (type === 'line_password') return 'Target: console or vty; expected: password'
  if (type === 'line_login') return 'Target: console or vty'
  if (type === 'line_transport_input') return 'Target: vty; expected: ssh, telnet, or ssh telnet'
  if (type === 'vlan_exists') return 'Target: VLAN number, such as 10'
  if (type === 'vlan_name') return 'Target: VLAN number; expected: SALES'
  if (type === 'interface_mode') return 'Target: FastEthernet0/1; expected: access or trunk'
  if (type === 'interface_description') return 'Target: interface; expected: description text'
  if (type === 'interface_access_vlan') return 'Target: FastEthernet0/1; expected: VLAN number'
  if (type === 'interface_voice_vlan') return 'Target: interface; expected: voice VLAN number'
  if (type === 'interface_trunk_native_vlan') return 'Target: trunk interface; expected: native VLAN number'
  if (type === 'interface_trunk_allowed_vlans') return 'Target: trunk interface; expected: 10,20,30-32'
  if (type === 'interface_enabled') return 'Target: GigabitEthernet0/1'
  if (type === 'interface_ip') return 'Target: GigabitEthernet0/1; expected: 192.168.1.1 255.255.255.0'
  return 'No target or expected value is needed.'
}

export default function InstructorCliLabBuilder() {
  const [workspace, setWorkspace] = useState({ labs: [], classes: [] })
  const [courses, setCourses] = useState([])
  const [modules, setModules] = useState([])
  const [lab, setLab] = useState(blankLab)
  const [showEditor, setShowEditor] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      const [workspaceData, courseData] = await Promise.all([
        getInstructorCliWorkspace(),
        getCourses(),
      ])
      setWorkspace(workspaceData)
      setCourses(courseData)
    } catch (error) {
      setMessage(
        `${error.message} Run migration 020_phase2_single_device_cli_practicals.sql if it has not been applied.`,
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function loadCourseModules(courseId) {
    setModules(courseId ? await getModules(courseId) : [])
  }

  function updateCriterion(index, field, value) {
    setLab((current) => ({
      ...current,
      criteria: current.criteria.map((criterion, itemIndex) =>
        itemIndex === index ? { ...criterion, [field]: value } : criterion,
      ),
    }))
  }

  function toggleClass(classId) {
    setLab((current) => ({
      ...current,
      classIds: current.classIds.includes(classId)
        ? current.classIds.filter((id) => id !== classId)
        : [...current.classIds, classId],
    }))
  }

  async function editLab(item) {
    setLab({ ...blankLab(), ...item })
    await loadCourseModules(String(item.courseId))
    setShowEditor(true)
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await saveCliLab({
        ...lab,
        durationMinutes: Number(lab.durationMinutes),
        maxAttempts: Number(lab.maxAttempts),
        passingScore: Number(lab.passingScore),
        criteria: lab.criteria.map((criterion) => ({
          ...criterion,
          points: Number(criterion.points),
        })),
      })
      setLab(blankLab())
      setModules([])
      setShowEditor(false)
      await loadData()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.title}" and its practical attempts?`)) return
    try {
      await deleteCliLab(item.id)
      await loadData()
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <div className="cli-lab-builder">
      <section className="cli-lab-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PHASE 2</span>
            <h2>CLI practical builder</h2>
            <p>Create single-device Cisco IOS exams and grade final configuration state.</p>
          </div>
          <button
            className="primary"
            type="button"
            onClick={() => {
              setLab(blankLab())
              setModules([])
              setShowEditor((current) => !current)
            }}
          >
            {showEditor ? 'Close builder' : 'Create CLI practical'}
          </button>
        </div>

        {showEditor && (
          <form className="cli-lab-editor" onSubmit={handleSave}>
            <div className="form-grid form-grid--three">
              <label>
                Course
                <select
                  required
                  value={lab.courseId}
                  onChange={(event) => {
                    const courseId = event.target.value
                    setLab((current) => ({ ...current, courseId, moduleId: '' }))
                    void loadCourseModules(courseId)
                  }}
                >
                  <option value="">Select course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.code} — {course.title}</option>
                  ))}
                </select>
              </label>
              <label>
                Module
                <select
                  value={lab.moduleId}
                  onChange={(event) =>
                    setLab((current) => ({ ...current, moduleId: event.target.value }))
                  }
                >
                  <option value="">All course modules</option>
                  {modules.map((module) => (
                    <option key={module.id} value={module.id}>{module.code} — {module.title}</option>
                  ))}
                </select>
              </label>
              <label>
                Device
                <select
                  value={lab.deviceType}
                  onChange={(event) =>
                    setLab((current) => ({ ...current, deviceType: event.target.value }))
                  }
                >
                  <option value="switch">Cisco switch</option>
                  <option value="router">Cisco router</option>
                </select>
              </label>
            </div>

            <div className="form-grid form-grid--three">
              <label>
                Practical title
                <input required value={lab.title} onChange={(event) =>
                  setLab((current) => ({ ...current, title: event.target.value }))
                } />
              </label>
              <label>
                Starting hostname
                <input required value={lab.initialHostname} onChange={(event) =>
                  setLab((current) => ({ ...current, initialHostname: event.target.value }))
                } />
              </label>
              <label>
                Status
                <select value={lab.status} onChange={(event) =>
                  setLab((current) => ({ ...current, status: event.target.value }))
                }>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>
            </div>

            <label>
              Description
              <input value={lab.description} onChange={(event) =>
                setLab((current) => ({ ...current, description: event.target.value }))
              } />
            </label>
            <label>
              Student instructions
              <textarea required rows="5" value={lab.instructions} onChange={(event) =>
                setLab((current) => ({ ...current, instructions: event.target.value }))
              } />
            </label>

            <div className="form-grid form-grid--three">
              <label>Duration (minutes)<input type="number" min="1" max="480" value={lab.durationMinutes}
                onChange={(event) => setLab((current) => ({ ...current, durationMinutes: event.target.value }))} /></label>
              <label>Maximum attempts<input type="number" min="1" max="100" value={lab.maxAttempts}
                onChange={(event) => setLab((current) => ({ ...current, maxAttempts: event.target.value }))} /></label>
              <label>Passing score (%)<input type="number" min="0" max="100" value={lab.passingScore}
                onChange={(event) => setLab((current) => ({ ...current, passingScore: event.target.value }))} /></label>
            </div>

            <fieldset className="cli-criteria-editor">
              <legend>Grading criteria</legend>
              {lab.criteria.map((criterion, index) => (
                <div className="cli-criterion-row" key={`${index}-${criterion.type}`}>
                  <label>
                    Requirement
                    <select value={criterion.type} onChange={(event) =>
                      updateCriterion(index, 'type', event.target.value)
                    }>
                      {criterionTypes.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Target
                    <input
                      disabled={targetNotRequired.includes(criterion.type)}
                      value={criterion.target}
                      onChange={(event) => updateCriterion(index, 'target', event.target.value)}
                    />
                  </label>
                  <label>
                    Expected value
                    <input
                      disabled={expectedNotRequired.includes(criterion.type)}
                      value={criterion.expected}
                      onChange={(event) => updateCriterion(index, 'expected', event.target.value)}
                    />
                  </label>
                  <label>
                    Points
                    <input type="number" min="1" value={criterion.points}
                      onChange={(event) => updateCriterion(index, 'points', event.target.value)} />
                  </label>
                  <button className="danger-button" type="button" disabled={lab.criteria.length === 1}
                    onClick={() => setLab((current) => ({
                      ...current,
                      criteria: current.criteria.filter((_, itemIndex) => itemIndex !== index),
                    }))}>Remove</button>
                  <small>{criterionHelp(criterion.type)}</small>
                </div>
              ))}
              <button className="secondary" type="button" onClick={() =>
                setLab((current) => ({ ...current, criteria: [...current.criteria, blankCriterion()] }))
              }>Add criterion</button>
            </fieldset>

            <fieldset className="cli-class-assignments">
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

            <div className="form-actions">
              <button className="primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : lab.id ? 'Save practical' : 'Create practical'}
              </button>
              <button className="secondary" type="button" onClick={() => setShowEditor(false)}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      <section className="cli-lab-panel">
        <div className="section-heading">
          <div><span className="eyebrow">CLI CONTENT</span><h2>Practical library</h2></div>
          <span className="status-chip">{workspace.labs.length} practicals</span>
        </div>
        {loading ? <p>Loading CLI practicals...</p> : !workspace.labs.length ? (
          <div className="empty-state"><h3>No CLI practicals yet</h3><p>Create the first single-device lab.</p></div>
        ) : (
          <div className="cli-lab-grid">
            {workspace.labs.map((item) => (
              <article className="cli-lab-card" key={item.id}>
                <header>
                  <span className="course-code">{item.courseCode}</span>
                  <span className={`content-status content-status--${item.status}`}>{item.status}</span>
                </header>
                <h3>{item.title}</h3>
                <p>{item.moduleCode || 'All modules'} · {item.deviceType}</p>
                <dl>
                  <div><dt>Duration</dt><dd>{item.durationMinutes} minutes</dd></div>
                  <div><dt>Criteria</dt><dd>{item.criteria.length}</dd></div>
                  <div><dt>Classes</dt><dd>{item.classIds.length}</dd></div>
                  <div><dt>Attempts</dt><dd>{item.maxAttempts}</dd></div>
                </dl>
                <div className="class-card__actions">
                  <button className="primary" type="button" onClick={() => void editLab(item)}>Edit</button>
                  <button className="danger-button" type="button" onClick={() => void handleDelete(item)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
        {message && <p className="form-message form-message--error">{message}</p>}
      </section>
    </div>
  )
}
