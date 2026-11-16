import assert from 'node:assert/strict'
import test from 'node:test'
import { groupCliReviewCriteria, groupCliReviewCommands } from './cliReviewDevices.js'

test('groups interleaved criteria by recorded ID without merging identical device names', () => {
  const criteria = [{ deviceId: 'r1', type: 'hostname' }, { deviceId: 'r2', type: 'vlan_exists' }, { deviceId: 'r1', type: 'config_saved' }]
  const groups = groupCliReviewCriteria(criteria, { deviceStates: { r1: { hostname: 'Router' }, r2: { hostname: 'Router' } } })
  assert.deepEqual(groups.map(g => [g.deviceId, g.name, g.criteria.map(c => c.type)]), [['r1', 'Router', ['hostname', 'config_saved']], ['r2', 'Router', ['vlan_exists']]])
  assert.equal(groups[0].criteria[0], criteria[0])
})

test('does not guess missing IDs from another device or the currently active device', () => {
  const groups = groupCliReviewCriteria([{}, { deviceId: 'missing' }], { activeDeviceId: 'r2', hostname: 'Primary', deviceStates: { r2: { hostname: 'Other' } } })
  assert.equal(groups[0].deviceId, null)
  assert.equal(groups[0].name, 'Primary')
  assert.equal(groups[1].deviceId, 'missing')
  assert.equal(groups[1].name, 'Device name not recorded')
})

test('uses saved device metadata when final hostname is unavailable; empty reviews stay empty', () => {
  assert.equal(groupCliReviewCriteria([{ deviceId: 's1' }], { devices: [{ id: 's1', label: 'Access switch' }] })[0].name, 'Access switch')
  assert.equal(groupCliReviewCriteria([{ deviceId: 's1' }], { devices: { s1: { hostname: 'SW1' } } })[0].name, 'SW1')
  assert.deepEqual(groupCliReviewCriteria([], {}), [])
})


test('command device tabs include idle devices and isolate interleaved commands in sequence order', () => {
  const commands = [{ deviceId: 'r1', sequence: 3, command: 'end' }, { deviceId: 'r2', sequence: 2, command: 'show vlan' }, { deviceId: 'r1', sequence: 1, command: 'enable' }, { sequence: 4, command: 'legacy' }]
  const groups = groupCliReviewCommands(commands, [], { deviceStates: { r1: { hostname: 'Router' }, r2: { hostname: 'Router' }, idle: { hostname: 'Idle PC' } } })
  assert.deepEqual(groups.map(g => [g.deviceId, g.commands.map(c => c.sequence)]), [['r1', [1,3]], ['r2', [2]], ['idle', []], [null, [4]]])
  assert.equal(commands[0].sequence, 3)
  assert.equal(groups[0].commands[1], commands[0])
})

test('command-only and criterion-only devices remain traceable without saved metadata', () => {
  const groups = groupCliReviewCommands([{ deviceId: 'gone', command: 'enable' }], [{ deviceId: 'other' }])
  assert.deepEqual(groups.map(g => g.deviceId), ['other','gone'])
  assert.equal(groups[1].name, 'Device name not recorded')
  assert.deepEqual(groupCliReviewCommands([], [], {}), [])
})
