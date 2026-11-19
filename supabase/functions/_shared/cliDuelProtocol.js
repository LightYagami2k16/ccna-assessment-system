import { createDeviceState, executeCiscoCommand, normalizeInterface } from './ciscoSimulator.js'

export const DUEL_VERSION = 2
export const DUEL_COUNTDOWN_SECONDS = 10
export const DUEL_CRITERIA = new Set(['hostname', 'enable_secret', 'password_encryption', 'banner_motd', 'line_password', 'line_login', 'interface_description', 'interface_enabled', 'interface_ip', 'config_saved', 'vlan_exists', 'vlan_name', 'interface_mode', 'interface_access_vlan'])
const switchOnly = new Set(['vlan_exists', 'vlan_name', 'interface_mode', 'interface_access_vlan'])
const noExpected = new Set(['password_encryption', 'line_login', 'interface_enabled', 'config_saved', 'vlan_exists'])
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const clean = (value, max = 256) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f-\x9f]/.test(value) // eslint-disable-line no-control-regex
const canonicalTarget = criterion => criterion.type.startsWith('interface_') ? normalizeInterface(criterion.target) : String(criterion.target ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
function exactKeys(value, keys) { if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('Unexpected duel request fields.') }

export function validateDuelDefinition(lab) {
  const errors = []
  if (!object(lab) || !Array.isArray(lab.devices) || lab.devices.length !== 1) return ['The pilot requires exactly one switch or router.']
  const device = lab.devices[0]
  if (!object(device) || !['switch', 'router'].includes(device.type)) return ['PCs and multi-device challenges are not supported in the pilot.']
  if (!clean(device.id, 80) || !clean(device.label, 160) || !clean(device.hostname, 63)) errors.push('Complete the device label and starting hostname.')
  if ((lab.topology?.links ?? []).length) errors.push('Remove physical links for this single-device pilot.')
  if (!clean(lab.title, 160) || typeof lab.instructions !== 'string' || !lab.instructions.trim()) errors.push('Enter a title and student instructions.')
  if (!Array.isArray(lab.criteria) || !lab.criteria.length || lab.criteria.length > 128) return [...errors, 'Provide 1–128 supported grading criteria.']
  const identities = new Set()
  let total = 0
  for (const criterion of lab.criteria) {
    if (!object(criterion) || !DUEL_CRITERIA.has(criterion.type) || (device.type !== 'switch' && switchOnly.has(criterion.type))) { errors.push('The challenge contains an unsupported objective.'); continue }
    if (criterion.deviceId && criterion.deviceId !== device.id) errors.push('Every objective must belong to the single device.')
    const points = Number(criterion.points)
    if (!Number.isFinite(points) || points <= 0) errors.push('Objective points must be positive finite numbers.')
    total += points
    if (typeof criterion.expected !== 'string' || (!noExpected.has(criterion.type) && !criterion.expected.trim())) errors.push('Complete every required expected value.')
    const target = canonicalTarget(criterion)
    if ((criterion.type.startsWith('interface_') || criterion.type.startsWith('line_') || criterion.type.startsWith('vlan_')) && !target) errors.push('Complete every required objective target.')
    const targeted = /^(interface_|line_|vlan_)/.test(criterion.type)
    const identityTarget = criterion.type.startsWith('line_') ? objectiveProbe(device, criterion)?.activeLine : target
    const identity = `${criterion.type}:${targeted ? identityTarget || '' : ''}`
    if (!objectiveProbe(device, criterion)) errors.push('An objective has an unattainable target or expected value.')
    if (identities.has(identity)) errors.push('Duplicate or conflicting objectives must be removed.')
    identities.add(identity)
  }
  if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) errors.push('The point total is too large to represent safely.')
  return [...new Set(errors)]
}


function objectiveProbe(device, criterion) {
  const {type, expected = '', target = ''} = criterion
  if (type.startsWith('vlan_') && (!/^[1-9]\d{0,3}$/.test(target) || Number(target) > 4094)) return null
  if (type === 'interface_access_vlan' && (!/^[1-9]\d{0,3}$/.test(expected) || Number(expected) > 4094)) return null
  if (typeof expected !== 'string' || expected !== expected.trim()) return null
  const objective = {
    hostname: `hostname ${expected}`, enable_secret: `enable secret ${expected}`,
    password_encryption: 'service password-encryption', banner_motd: `banner motd #${expected}#`,
    line_password: `password ${expected}`, line_login: 'login', interface_description: `description ${expected}`,
    interface_enabled: 'no shutdown', interface_ip: `ip address ${expected}`, config_saved: 'end',
    vlan_exists: 'exit', vlan_name: `name ${expected}`, interface_mode: `switchport mode ${expected}`,
    interface_access_vlan: `switchport access vlan ${expected}`,
  }[type]
  const commands = ['enable','configure terminal']
  if (type.startsWith('interface_')) commands.push(`interface ${target}`)
  if (type.startsWith('line_')) commands.push(`line ${target}`)
  if (type.startsWith('vlan_')) commands.push(`vlan ${target}`)
  commands.push(objective)
  let state = createDeviceState(device.hostname, device.type)
  for (const command of commands) {
    if (!clean(command, 500)) return null
    const next = executeCiscoCommand(state,command)
    if (!next.accepted) return null
    state = next.state
  }
  return state
}

export function defaultDuelDamage(criteria, startingHp = 100) {
  const values=criteria.map(criterion => Number(criterion?.points))
  if (!Number.isInteger(startingHp) || startingHp<1 || startingHp>10000 || !values.length || values.some(value => !Number.isFinite(value) || value<=0)) throw new Error('Enter valid HP and objective points.')
  const decimal=values.map(value => {
    const [mantissa, exponent='0']=String(value).toLowerCase().split('e')
    const [whole,fraction='']=mantissa.split('.')
    return {digits:BigInt(whole+fraction),scale:fraction.length-Number(exponent)}
  })
  const scale=Math.max(0,...decimal.map(item=>item.scale))
  const units=decimal.map(item=>item.digits*10n**BigInt(scale-item.scale))
  const total=units.reduce((sum,value)=>sum+value,0n),budget=BigInt(startingHp*100)
  const cents=units.map(value=>budget*value/total)
  const fractions=units.map((value,index)=>({index,remainder:budget*value%total}))
  let remaining=Number(budget-cents.reduce((sum,value)=>sum+value,0n))
  for (const item of fractions.sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)) {
    if (remaining--<=0) break
    cents[item.index]+=1n
  }
  return cents.map(value=>Number(value)/100)
}

export function prepareDuelDefinition(base, customization = null, combat = null) {
  if (customization != null) exactKeys(customization, ['instructions','deviceLabel','initialHostname','criteria'])
  if (combat != null) exactKeys(combat, ['startingHp','damage'])
  const custom = customization || {}
  if (!base?.devices?.[0]) throw new Error('Choose a single-device practical.')
  const copy = structuredClone(base)
  copy.version = 2
  copy.instructions = custom.instructions ?? copy.instructions
  copy.devices[0].label = custom.deviceLabel ?? copy.devices[0].label
  copy.devices[0].hostname = custom.initialHostname ?? copy.devices[0].hostname
  const source = custom.criteria ?? copy.criteria
  if (!Array.isArray(source) || source.length < 1 || source.length > 128) throw new Error('Provide 1–128 objectives.')
  copy.criteria = source.map((criterion, index) => {
    if (custom.criteria) exactKeys(criterion, ['id','label','type','target','expected','points','deviceId'])
    if (!object(criterion) || typeof criterion.points !== 'number') throw new Error('Objective points must be positive numbers.')
    if (criterion.deviceId && criterion.deviceId !== copy.devices[0].id) throw new Error('Every objective must belong to the single device.')
    return {type:criterion.type,target:criterion.target ?? '',expected:criterion.expected ?? '',points:criterion.points,deviceId:copy.devices[0].id,label:criterion.label ?? '',objectiveId:`objective-${index+1}`}
  })
  if (copy.criteria.some(criterion => typeof criterion.expected==='string' && criterion.expected !== criterion.expected.replace(/\s+/g,' ').trim())) throw new Error('Expected values must use single spaces, with no leading or trailing whitespace.')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(copy.devices[0].hostname)) throw new Error('Enter a valid starting hostname.')
  const errors = validateDuelDefinition(copy)
  if (errors.length) throw new Error(errors.join(' '))
  if (copy.instructions.length > 32000) throw new Error('Instructions must be at most 32000 characters.')
  const startingHp = combat?.startingHp ?? 100
  if (!Number.isInteger(startingHp) || startingHp < 1 || startingHp > 10000) throw new Error('Starting HP must be a whole number from 1 to 10000.')
  const damage = combat?.damage ?? defaultDuelDamage(copy.criteria,startingHp)
  if (!Array.isArray(damage) || damage.length !== copy.criteria.length || damage.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000 || Math.abs(value*100-Math.round(value*100)) > 0.000001)) throw new Error('Each objective needs damage from 0 to 10000 with at most two decimals.')
  if (damage.reduce((sum,value) => sum+Math.round(value*100),0) < startingHp*100) throw new Error('Total objective damage must reach the starting HP.')
  copy.combat = {startingHp,damage:[...damage]}
  return copy
}

export function validateDuelRequest(body) {
  if (!object(body)) throw new Error('A duel request is required.')
  if (body.action === 'command') {
    exactKeys(body, ['action', 'participantId', 'clientId', 'commandId', 'sequence', 'expectedRevision', 'command'])
    if (!uuid(body.participantId) || !uuid(body.commandId) || !clean(body.clientId, 200) || body.clientId.length < 16 || !/^[A-Za-z0-9:_-]+$/.test(body.clientId)) throw new Error('Invalid duel identity or browser session.')
    if (!Number.isSafeInteger(body.sequence) || body.sequence < 1 || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new Error('Invalid command sequence.')
    if (!clean(body.command, 500)) throw new Error('Enter a single command of at most 500 characters.')
  } else if (body.action === 'create') {
    exactKeys(body, ['action', 'labId', 'rematchId', 'title', 'durationMinutes', 'participantSelections', 'allowReview', 'rulesVersion', 'customization', 'combat'])
    if (body.rulesVersion != null && body.rulesVersion !== 2) throw new Error('Unsupported duel rules version.')
    if ((body.customization != null || body.combat != null) && body.rulesVersion !== 2) throw new Error('Custom duels require rules version 2.')
    if (body.customization != null) exactKeys(body.customization, ['instructions','deviceLabel','initialHostname','criteria'])
    if (body.combat != null) exactKeys(body.combat, ['startingHp','damage'])
    if (Boolean(body.labId) === Boolean(body.rematchId) || !uuid(body.labId || body.rematchId)) throw new Error('Choose a practical or rematch.')
    if (!clean(body.title, 160) || !Number.isInteger(body.durationMinutes) || body.durationMinutes < 1 || body.durationMinutes > 480 || typeof body.allowReview !== 'boolean') throw new Error('Enter a title and a whole-minute time limit from 1 to 480.')
    if (!Array.isArray(body.participantSelections) || body.participantSelections.length !== 2) throw new Error('Select exactly two students.')
    for (const participant of body.participantSelections) {
      exactKeys(participant, ['studentId', 'classId'])
      if (!uuid(participant.studentId) || (participant.classId != null && !uuid(participant.classId))) throw new Error('Invalid participant selection.')
    }
    if (body.participantSelections[0].studentId === body.participantSelections[1].studentId) throw new Error('Select two different students.')
  } else throw new Error('Unsupported duel action.')
  return body
}

function wrap(device, state) { return { ...state, deviceStates: { [device.id]: state }, activeDeviceId: device.id } }
export function createDuelInitialState(snapshot) {
  const errors = validateDuelDefinition(snapshot)
  if (errors.length) throw new Error(errors.join(' '))
  const device = snapshot.devices[0]
  return wrap(device, createDeviceState(device.hostname, device.type))
}
export function executeDuelCommand(snapshot, wrappedState, command) {
  if (!clean(command, 500)) throw new Error('Enter a single command of at most 500 characters.')
  const device = snapshot.devices[0]
  const current = wrappedState.deviceStates?.[device.id]
  if (!current || !['switch', 'router'].includes(device.type)) throw new Error('The verified device state is unavailable.')
  const outcome = executeCiscoCommand(current, command)
  return { ...outcome, state: wrap(device, outcome.state) }
}
