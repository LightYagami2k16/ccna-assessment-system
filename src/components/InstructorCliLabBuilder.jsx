import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCourses, getModules } from '../services/questionService'
import {
  bulkManageCliLabs,
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
  ['interface_dot1q', 'Subinterface 802.1Q VLAN'],
  ['interface_dot1q_native', 'Native 802.1Q VLAN'],
  ['interface_enabled', 'Interface enabled'],
  ['interface_ip', 'Interface IP address'],
  ['ip_routing_enabled', 'Layer 3 IP routing enabled'],
  ['default_gateway', 'Switch default gateway'],
  ['static_route', 'Static route'],
  ['default_route', 'Default route'],
  ['ospf_process', 'OSPF process exists'],
  ['ospf_router_id', 'OSPF router ID'],
  ['ospf_network', 'OSPF network statement'],
  ['ospf_passive_interface', 'OSPF passive interface'],
  ['ospf_default_information', 'OSPF default information originate'],
  ['acl_exists', 'Access list exists'],
  ['acl_entry', 'Access list entry'],
  ['interface_acl', 'Interface access list'],
  ['config_saved', 'Configuration saved'],
]

const criterionTypeLabels = Object.fromEntries(criterionTypes)
const sensitiveCriterionTypes = new Set([
  'enable_secret',
  'local_user',
  'line_password',
])

const targetNotRequired = [
  'hostname',
  'enable_secret',
  'password_encryption',
  'banner_motd',
  'domain_name',
  'ip_routing_enabled',
  'default_gateway',
  'default_route',
  'config_saved',
]

const expectedNotRequired = [
  'password_encryption',
  'line_login',
  'vlan_exists',
  'interface_enabled',
  'ip_routing_enabled',
  'ospf_process',
  'ospf_default_information',
  'acl_exists',
  'config_saved',
]

function blankCriterion() {
  return { type: 'hostname', target: '', expected: '', points: 10 }
}

function presetCriteria(preset) {
  const criterion = (type, expected = '') => ({
    type,
    target: '',
    expected,
    points: 10,
  })

  const presets = {
    basic_device: [
      criterion('hostname'),
      criterion('enable_secret'),
      criterion('password_encryption'),
      criterion('banner_motd'),
      criterion('config_saved'),
    ],
    vlan_access: [
      criterion('vlan_exists'),
      criterion('vlan_name'),
      criterion('interface_mode', 'access'),
      criterion('interface_access_vlan'),
      criterion('interface_enabled'),
      criterion('config_saved'),
    ],
    router_on_stick: [
      criterion('interface_dot1q'),
      criterion('interface_ip'),
      criterion('interface_enabled'),
      criterion('default_route'),
      criterion('config_saved'),
    ],
    static_routing: [
      criterion('interface_ip'),
      criterion('interface_enabled'),
      criterion('static_route'),
      criterion('default_route'),
      criterion('config_saved'),
    ],
    single_area_ospf: [
      criterion('ospf_process'),
      criterion('ospf_router_id'),
      criterion('ospf_network'),
      criterion('ospf_passive_interface'),
      criterion('config_saved'),
    ],
    standard_acl: [
      criterion('acl_exists'),
      criterion('acl_entry'),
      criterion('interface_acl'),
      criterion('config_saved'),
    ],
    extended_acl: [
      criterion('acl_exists'),
      criterion('acl_entry'),
      criterion('interface_acl'),
      criterion('config_saved'),
    ],
  }

  return presets[preset] ?? []
}

function criterionSummary(criterion) {
  const values = []
  if (criterion.target?.trim()) values.push(criterion.target.trim())
  if (criterion.expected?.trim()) {
    values.push(
      sensitiveCriterionTypes.has(criterion.type)
        ? 'Value configured'
        : criterion.expected.trim(),
    )
  }
  return values.length ? values.join(' → ') : 'Details not entered'
}

function criterionRequiredState(type) {
  return {
    password_encryption: 'Enabled',
    line_login: 'Enabled',
    vlan_exists: 'Must exist',
    interface_enabled: 'Enabled (no shutdown)',
    ip_routing_enabled: 'Enabled',
    ospf_process: 'Must exist',
    ospf_default_information: 'Enabled',
    acl_exists: 'Must exist',
    config_saved: 'Running configuration saved',
  }[type] ?? 'Configured'
}

function configurationCommands(...commands) {
  return [
    'enable',
    'configure terminal',
    ...commands.filter(Boolean),
    'end',
  ]
}

function lineConfigurationTarget(target) {
  const normalized = String(target ?? '').trim().toLowerCase()
  if (normalized === 'console' || normalized === 'console 0') {
    return 'line console 0'
  }
  if (normalized === 'vty') return 'line vty 0 4'
  return `line ${String(target ?? '').trim()}`
}

function inferNamedAclType(statement) {
  const protocol = String(statement ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)[1]
  return [
    'ahp',
    'eigrp',
    'esp',
    'gre',
    'icmp',
    'igmp',
    'ip',
    'ipinip',
    'nos',
    'ospf',
    'pcp',
    'pim',
    'tcp',
    'udp',
  ].includes(protocol)
    ? 'extended'
    : 'standard'
}

function aclConfigurationCommands(target, statement = '') {
  const aclId = String(target ?? '').trim()
  const aclStatement = String(statement ?? '').trim()
  if (/^\d+$/.test(aclId)) {
    const aclNumber = Number(aclId)
    const isExtended =
      (aclNumber >= 100 && aclNumber <= 199)
      || (aclNumber >= 2000 && aclNumber <= 2699)
    return configurationCommands(
      `access-list ${aclId} ${
        aclStatement || (isExtended ? 'permit ip any any' : 'permit any')
      }`,
    )
  }

  const aclType = inferNamedAclType(aclStatement)
  return configurationCommands(
    `ip access-list ${aclType} ${aclId}`,
    aclStatement || (aclType === 'extended' ? 'permit ip any any' : 'permit any'),
    'exit',
  )
}

function criterionConfigurationCommands(criterion, allCriteria) {
  const target = String(criterion.target ?? '').trim()
  const expected = String(criterion.expected ?? '').trim()
  const interfaceCommands = (...commands) =>
    configurationCommands(`interface ${target}`, ...commands)
  const routerCommands = (...commands) =>
    configurationCommands(`router ospf ${target}`, ...commands)

  switch (criterion.type) {
    case 'hostname':
      return configurationCommands(`hostname ${expected}`)
    case 'enable_secret':
      return configurationCommands(`enable secret ${expected}`)
    case 'password_encryption':
      return configurationCommands('service password-encryption')
    case 'banner_motd': {
      const delimiter = expected.includes('#') ? '^' : '#'
      return configurationCommands(
        `banner motd ${delimiter}${expected}${delimiter}`,
      )
    }
    case 'domain_name':
      return configurationCommands(`ip domain-name ${expected}`)
    case 'local_user':
      return configurationCommands(`username ${target} secret ${expected}`)
    case 'line_password':
      return configurationCommands(
        lineConfigurationTarget(target),
        `password ${expected}`,
        'exit',
      )
    case 'line_login':
      return configurationCommands(
        lineConfigurationTarget(target),
        'login',
        'exit',
      )
    case 'line_transport_input':
      return configurationCommands(
        lineConfigurationTarget(target),
        `transport input ${expected}`,
        'exit',
      )
    case 'vlan_exists':
      return configurationCommands(`vlan ${target}`, 'exit')
    case 'vlan_name':
      return configurationCommands(
        `vlan ${target}`,
        `name ${expected}`,
        'exit',
      )
    case 'interface_mode':
      return interfaceCommands(`switchport mode ${expected}`)
    case 'interface_description':
      return interfaceCommands(`description ${expected}`)
    case 'interface_access_vlan':
      return interfaceCommands(`switchport access vlan ${expected}`)
    case 'interface_voice_vlan':
      return interfaceCommands(`switchport voice vlan ${expected}`)
    case 'interface_trunk_native_vlan':
      return interfaceCommands(`switchport trunk native vlan ${expected}`)
    case 'interface_trunk_allowed_vlans':
      return interfaceCommands(`switchport trunk allowed vlan ${expected}`)
    case 'interface_dot1q':
      return interfaceCommands(`encapsulation dot1q ${expected}`)
    case 'interface_dot1q_native':
      return interfaceCommands(`encapsulation dot1q ${expected} native`)
    case 'interface_enabled':
      return interfaceCommands('no shutdown')
    case 'interface_ip':
      return interfaceCommands(`ip address ${expected}`)
    case 'ip_routing_enabled':
      return configurationCommands('ip routing')
    case 'default_gateway':
      return configurationCommands(`ip default-gateway ${expected}`)
    case 'static_route':
      return configurationCommands(`ip route ${target} ${expected}`)
    case 'default_route':
      return configurationCommands(
        `ip route 0.0.0.0 0.0.0.0 ${expected}`,
      )
    case 'ospf_process':
      return routerCommands()
    case 'ospf_router_id':
      return routerCommands(`router-id ${expected}`)
    case 'ospf_network':
      return routerCommands(`network ${expected}`)
    case 'ospf_passive_interface':
      return routerCommands(`passive-interface ${expected}`)
    case 'ospf_default_information':
      return routerCommands('default-information originate')
    case 'acl_exists': {
      const relatedEntry = allCriteria.find(
        (item) =>
          item.type === 'acl_entry'
          && String(item.target ?? '').trim().toLowerCase()
            === target.toLowerCase(),
      )
      return aclConfigurationCommands(target, relatedEntry?.expected)
    }
    case 'acl_entry':
      return aclConfigurationCommands(target, expected)
    case 'interface_acl':
      return interfaceCommands(`ip access-group ${expected}`)
    case 'config_saved':
      return ['enable', 'copy running-config startup-config']
    default:
      return configurationCommands(
        `! Configure ${criterionTypeLabels[criterion.type] ?? criterion.type}`,
      )
  }
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
  if (type === 'interface_dot1q') return 'Target: subinterface, such as G0/0.10; expected: VLAN number'
  if (type === 'interface_dot1q_native') return 'Target: subinterface; expected: native VLAN number'
  if (type === 'interface_enabled') return 'Target: GigabitEthernet0/1'
  if (type === 'interface_ip') return 'Target: GigabitEthernet0/1; expected: 192.168.1.1 255.255.255.0'
  if (type === 'ip_routing_enabled') return 'Checks whether the multilayer switch has ip routing enabled'
  if (type === 'default_gateway') return 'Expected value: the Layer 2 switch default gateway'
  if (type === 'static_route') return 'Target: destination and mask; expected: next-hop IP or exit interface'
  if (type === 'default_route') return 'Expected value: next-hop IP or exit interface'
  if (type === 'ospf_process') return 'Target: OSPF process ID, such as 10'
  if (type === 'ospf_router_id') return 'Target: process ID; expected: router ID, such as 1.1.1.1'
  if (type === 'ospf_network') return 'Target: process ID; expected: network wildcard area area-ID'
  if (type === 'ospf_passive_interface') return 'Target: process ID; expected: interface name or default'
  if (type === 'ospf_default_information') return 'Target: OSPF process ID'
  if (type === 'acl_exists') return 'Target: ACL number or name, such as 10 or WEB-FILTER'
  if (type === 'acl_entry') return 'Target: ACL number or name; expected: complete permit or deny statement'
  if (type === 'interface_acl') return 'Target: interface; expected: ACL number or name followed by in or out'
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
  const [expandedCriterionIndex, setExpandedCriterionIndex] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState('')
  const [selectedLabIds, setSelectedLabIds] = useState([])
  const [bulkLabAction, setBulkLabAction] = useState('')
  const [bulkManaging, setBulkManaging] = useState(false)
  const [answerKeyLabId, setAnswerKeyLabId] = useState(null)
  const [expandedLabIds, setExpandedLabIds] = useState([])
  const [expandedCourseIds, setExpandedCourseIds] = useState([])

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

  const totalCriterionPoints = lab.criteria.reduce(
    (total, criterion) => total + (Number(criterion.points) || 0),
    0,
  )

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
      setSelectedLabIds((current) =>
        current.filter((id) => workspaceData.labs.some((item) => item.id === id)),
      )
      setExpandedLabIds((current) =>
        current.filter((id) => workspaceData.labs.some((item) => item.id === id)),
      )
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

  useEffect(() => {
    const courseIds = practicalCourseGroups.map((course) => course.id)
    setExpandedCourseIds((current) =>
      current.filter((id) => courseIds.includes(id)),
    )
  }, [practicalCourseGroups])

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

  function changeCriterionType(index, type) {
    setLab((current) => ({
      ...current,
      criteria: current.criteria.map((criterion, itemIndex) =>
        itemIndex === index
          ? { ...criterion, type, target: '', expected: '' }
          : criterion,
      ),
    }))
  }

  function addCriterion() {
    const newIndex = lab.criteria.length
    setLab((current) => ({
      ...current,
      criteria: [...current.criteria, blankCriterion()],
    }))
    setExpandedCriterionIndex(newIndex)
  }

  function duplicateCriterion(index) {
    setLab((current) => {
      const nextCriteria = [...current.criteria]
      nextCriteria.splice(index + 1, 0, { ...current.criteria[index] })
      return { ...current, criteria: nextCriteria }
    })
    setExpandedCriterionIndex(index + 1)
  }

  function removeCriterion(index) {
    setLab((current) => ({
      ...current,
      criteria: current.criteria.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    }))
    setExpandedCriterionIndex((current) => {
      if (current === null || current === index) return null
      return current > index ? current - 1 : current
    })
  }

  function addPreset() {
    const additions = presetCriteria(selectedPreset)
    if (!additions.length) return

    const replaceBlankCriterion =
      lab.criteria.length === 1
      && lab.criteria[0].type === 'hostname'
      && !lab.criteria[0].target
      && !lab.criteria[0].expected

    const startIndex = replaceBlankCriterion ? 0 : lab.criteria.length
    setLab((current) => ({
      ...current,
      criteria: replaceBlankCriterion
        ? additions
        : [...current.criteria, ...additions],
    }))
    setExpandedCriterionIndex(startIndex)
    setSelectedPreset('')
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
    setExpandedCriterionIndex(0)
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
      setExpandedCriterionIndex(0)
      setSelectedPreset('')
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

  function toggleLabSelection(labId) {
    setSelectedLabIds((current) =>
      current.includes(labId)
        ? current.filter((id) => id !== labId)
        : [...current, labId],
    )
  }

  function toggleLabExpanded(labId) {
    setExpandedLabIds((current) =>
      current.includes(labId)
        ? current.filter((id) => id !== labId)
        : [...current, labId],
    )
    if (answerKeyLabId === labId) setAnswerKeyLabId(null)
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

    if (
      bulkLabAction === 'delete'
      && !window.confirm(
        `Delete ${selectedLabIds.length} selected practical(s) and their attempts? This cannot be undone.`,
      )
    ) {
      return
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
              setExpandedCriterionIndex(0)
              setSelectedPreset('')
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
              <div className="cli-criteria-overview">
                <div>
                  <strong>{lab.criteria.length} requirements</strong>
                  <span>
                    Expand one requirement at a time to edit its details.
                  </span>
                </div>
                <div className="cli-criteria-total">
                  <span>Total</span>
                  <strong>{totalCriterionPoints} points</strong>
                </div>
              </div>

              <div className="cli-criteria-toolbar">
                <div className="cli-preset-control">
                  <label htmlFor="cli-criterion-preset">
                    Quick preset
                  </label>
                  <div>
                    <select
                      id="cli-criterion-preset"
                      value={selectedPreset}
                      onChange={(event) =>
                        setSelectedPreset(event.target.value)
                      }
                    >
                      <option value="">Select a preset</option>
                      <option value="basic_device">
                        Basic device configuration
                      </option>
                      <option value="vlan_access">
                        VLAN and access ports
                      </option>
                      <option value="router_on_stick">
                        Router-on-a-stick
                      </option>
                      <option value="static_routing">
                        Static routing
                      </option>
                      <option value="single_area_ospf">
                        Single-area OSPF
                      </option>
                      <option value="standard_acl">
                        Standard ACL
                      </option>
                      <option value="extended_acl">
                        Extended ACL
                      </option>
                    </select>
                    <button
                      className="secondary"
                      type="button"
                      disabled={!selectedPreset}
                      onClick={addPreset}
                    >
                      Add preset
                    </button>
                  </div>
                </div>

                <div className="cli-criteria-toolbar__actions">
                  <button
                    className="secondary cli-answer-key-toggle"
                    type="button"
                    onClick={() => setExpandedCriterionIndex(null)}
                  >
                    Collapse all
                  </button>
                  <button
                    className="primary"
                    type="button"
                    onClick={addCriterion}
                  >
                    Add criterion
                  </button>
                </div>
              </div>

              <div className="cli-criterion-list">
                {lab.criteria.map((criterion, index) => {
                  const expanded = expandedCriterionIndex === index
                  const panelId = `cli-criterion-panel-${index}`

                  return (
                    <article
                      className={[
                        'cli-criterion-card',
                        expanded ? 'cli-criterion-card--expanded' : '',
                      ].filter(Boolean).join(' ')}
                      key={index}
                    >
                      <button
                        className="cli-criterion-summary"
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() =>
                          setExpandedCriterionIndex(
                            expanded ? null : index,
                          )
                        }
                      >
                        <span className="cli-criterion-summary__number">
                          {index + 1}
                        </span>
                        <span className="cli-criterion-summary__content">
                          <strong>
                            {criterionTypeLabels[criterion.type]
                              ?? criterion.type}
                          </strong>
                          <small>{criterionSummary(criterion)}</small>
                        </span>
                        <span className="cli-criterion-summary__points">
                          {Number(criterion.points) || 0} pts
                        </span>
                        <span
                          className="cli-criterion-summary__toggle"
                          aria-hidden="true"
                        >
                          {expanded ? '−' : '+'}
                        </span>
                      </button>

                      {expanded && (
                        <div
                          className="cli-criterion-panel"
                          id={panelId}
                        >
                          <div className="cli-criterion-fields">
                            <label>
                              Requirement
                              <select
                                value={criterion.type}
                                onChange={(event) =>
                                  changeCriterionType(
                                    index,
                                    event.target.value,
                                  )
                                }
                              >
                                {criterionTypes.map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Target
                              <input
                                disabled={targetNotRequired.includes(
                                  criterion.type,
                                )}
                                value={criterion.target}
                                onChange={(event) =>
                                  updateCriterion(
                                    index,
                                    'target',
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label>
                              Expected value
                              <input
                                disabled={expectedNotRequired.includes(
                                  criterion.type,
                                )}
                                value={criterion.expected}
                                onChange={(event) =>
                                  updateCriterion(
                                    index,
                                    'expected',
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label>
                              Points
                              <input
                                type="number"
                                min="1"
                                value={criterion.points}
                                onChange={(event) =>
                                  updateCriterion(
                                    index,
                                    'points',
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                          </div>

                          <div className="cli-criterion-panel__footer">
                            <small>{criterionHelp(criterion.type)}</small>
                            <div>
                              <button
                                className="secondary"
                                type="button"
                                onClick={() => duplicateCriterion(index)}
                              >
                                Duplicate
                              </button>
                              <button
                                className="danger-button"
                                type="button"
                                disabled={lab.criteria.length === 1}
                                onClick={() => removeCriterion(index)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
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
          <div className="cli-library-content">
            <div className="cli-library-bulk-toolbar">
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
              <div className="cli-library-bulk-actions">
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
                  {bulkManaging ? 'Applying...' : 'Apply'}
                </button>
              </div>
            </div>
            <div className="cli-practical-course-groups">
            {practicalCourseGroups.map((course) => {
              const courseExpanded = expandedCourseIds.includes(course.id)
              const coursePanelId = `cli-course-panel-${course.id}`
              const courseLabIds = course.labs.map((item) => item.id)
              const allCourseLabsSelected =
                courseLabIds.length > 0
                && courseLabIds.every((id) => selectedLabIds.includes(id))

              return (
                <section className="cli-practical-course-group" key={course.id}>
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
                    <div className="cli-lab-grid" id={coursePanelId}>
            {course.labs.map((item) => {
              const isExpanded = expandedLabIds.includes(item.id)
              return (
              <article
                className={`cli-lab-card${
                  isExpanded ? ' cli-lab-card--expanded' : ''
                }`}
                key={item.id}
              >
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
                <div className="cli-lab-card__summary">
                  <div>
                    <h3>{item.title}</h3>
                <p>{item.moduleCode || 'All modules'} · {item.deviceType}</p>
                  </div>
                  <button
                    className="secondary cli-lab-card__toggle"
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={`cli-lab-details-${item.id}`}
                    onClick={() => toggleLabExpanded(item.id)}
                  >
                    {isExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {isExpanded && (
                  <div
                    className="cli-lab-card__details"
                    id={`cli-lab-details-${item.id}`}
                  >
                <dl>
                  <div><dt>Duration</dt><dd>{item.durationMinutes} minutes</dd></div>
                  <div><dt>Criteria</dt><dd>{item.criteria.length}</dd></div>
                  <div><dt>Classes</dt><dd>{item.classIds.length}</dd></div>
                  <div><dt>Attempts</dt><dd>{item.maxAttempts}</dd></div>
                </dl>
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
                  <button className="primary" type="button" onClick={() => void editLab(item)}>Edit</button>
                  <button className="danger-button" type="button" onClick={() => void handleDelete(item)}>Delete</button>
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
                            <span>Configuration commands</span>
                            <pre>
                              <code>{criterionConfigurationCommands(
                                  criterion,
                                  item.criteria ?? [],
                                ).join('\n')}</code>
                            </pre>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </section>
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
            })}
            </div>
          </div>
        )}
        {message && <p className="form-message">{message}</p>}
      </section>
    </div>
  )
}
