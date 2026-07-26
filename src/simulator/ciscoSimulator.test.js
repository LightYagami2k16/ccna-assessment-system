import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDeviceState,
  executeCiscoCommand,
  normalizeInterface,
  parseVlanList,
} from './ciscoSimulator.js'

function runCommands(commands, hostname = 'Switch') {
  return commands.reduce(
    (state, command) => {
      const result = executeCiscoCommand(state, command)
      assert.equal(result.accepted, true, `Command should be accepted: ${command}`)
      return result.state
    },
    createDeviceState(hostname),
  )
}

test('normalizes common two-level and three-level Cisco interfaces', () => {
  assert.equal(normalizeInterface('f0/3'), 'FastEthernet0/3')
  assert.equal(normalizeInterface('Gi 0/1'), 'GigabitEthernet0/1')
  assert.equal(normalizeInterface('g0/0/1'), 'GigabitEthernet0/0/1')
  assert.equal(normalizeInterface('po1'), 'Port-channel1')
  assert.equal(normalizeInterface('vlan 99'), 'Vlan99')
})

test('parses, expands, sorts, and de-duplicates VLAN lists', () => {
  assert.deepEqual(parseVlanList('30,10,20-22,10'), [10, 20, 21, 22, 30])
  assert.deepEqual(parseVlanList('none'), [])
  assert.equal(parseVlanList('all'), null)
  assert.equal(parseVlanList('0,10'), undefined)
})

test('configures basic device security and line settings', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'hostname SW1',
    'enable secret class',
    'service password-encryption',
    'banner motd #Authorized users only#',
    'ip domain-name school.example',
    'username admin secret ccna',
    'line console 0',
    'password consolepass',
    'login',
    'exit',
    'line vty 0 4',
    'password vtypass',
    'login',
    'transport input ssh',
  ])

  assert.equal(state.hostname, 'SW1')
  assert.equal(state.enableSecret, 'class')
  assert.equal(state.servicePasswordEncryption, true)
  assert.equal(state.bannerMotd, 'Authorized users only')
  assert.equal(state.domainName, 'school.example')
  assert.deepEqual(state.users.admin, { secret: 'ccna' })
  assert.deepEqual(state.lines.console, {
    password: 'consolepass',
    login: true,
    transportInput: '',
  })
  assert.equal(state.lines.vty.transportInput, 'ssh')
})

test('configures access, voice, and trunk VLAN properties', () => {
  const state = runCommands([
    'enable',
    'conf t',
    'vlan 10',
    'name SALES',
    'exit',
    'int f0/1',
    'description Sales workstation',
    'switchport mode access',
    'switchport access vlan 10',
    'switchport voice vlan 20',
    'no shutdown',
    'exit',
    'interface gi0/1',
    'switchport mode trunk',
    'switchport trunk native vlan 99',
    'switchport trunk allowed vlan 10,20,99-100',
    'end',
  ])

  assert.deepEqual(state.interfaces['FastEthernet0/1'], {
    description: 'Sales workstation',
    switchportMode: 'access',
    accessVlan: 10,
    voiceVlan: 20,
    trunkNativeVlan: 1,
    trunkAllowedVlans: null,
    ipAddress: '',
    subnetMask: '',
    shutdown: false,
  })
  assert.equal(state.interfaces['GigabitEthernet0/1'].switchportMode, 'trunk')
  assert.equal(state.interfaces['GigabitEthernet0/1'].trunkNativeVlan, 99)
  assert.deepEqual(
    state.interfaces['GigabitEthernet0/1'].trunkAllowedVlans,
    [10, 20, 99, 100],
  )
})

test('verification commands do not mark a saved configuration as modified', () => {
  let state = runCommands([
    'enable',
    'configure terminal',
    'hostname SW1',
    'end',
    'copy run start',
  ])

  assert.equal(state.saved, true)
  const result = executeCiscoCommand(state, 'show running-config')
  assert.equal(result.accepted, true)
  assert.match(result.output, /hostname SW1/)
  state = result.state
  assert.equal(state.saved, true)
})
