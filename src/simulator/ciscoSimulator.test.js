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
  assert.equal(normalizeInterface('g0/0.10'), 'GigabitEthernet0/0.10')
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
    encapsulationDot1q: null,
    encapsulationNative: false,
    ipAddress: '',
    subnetMask: '',
    shutdown: false,
    ipAccessGroups: {
      in: '',
      out: '',
    },
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

test('configures router-on-a-stick subinterfaces and connected routes', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'interface g0/0',
    'no shutdown',
    'exit',
    'interface g0/0.10',
    'encapsulation dot1q 10',
    'ip address 192.168.10.1 255.255.255.0',
    'exit',
    'interface g0/0.99',
    'encapsulation dot1q 99 native',
    'ip address 192.168.99.1 255.255.255.0',
    'end',
  ], 'Router')

  assert.equal(
    state.interfaces['GigabitEthernet0/0.10'].encapsulationDot1q,
    10,
  )
  assert.equal(
    state.interfaces['GigabitEthernet0/0.99'].encapsulationNative,
    true,
  )

  const routeResult = executeCiscoCommand(state, 'show ip route')
  assert.equal(routeResult.accepted, true)
  assert.match(routeResult.output, /192\.168\.10\.0\/24/)
  assert.match(routeResult.output, /GigabitEthernet0\/0\.10|Gi0\/0\.10/)
})

test('configures SVI routing, a static route, and a default route', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'ip routing',
    'interface vlan 10',
    'ip address 10.10.10.1 255.255.255.0',
    'no shutdown',
    'exit',
    'ip route 172.16.0.0 255.255.0.0 10.10.10.2',
    'ip route 0.0.0.0 0.0.0.0 g0/1',
    'end',
  ])

  assert.equal(state.ipRouting, true)
  assert.equal(state.interfaces.Vlan10.ipAddress, '10.10.10.1')
  assert.deepEqual(state.staticRoutes, [
    {
      network: '172.16.0.0',
      mask: '255.255.0.0',
      nextHop: '10.10.10.2',
      administrativeDistance: 1,
    },
    {
      network: '0.0.0.0',
      mask: '0.0.0.0',
      nextHop: 'GigabitEthernet0/1',
      administrativeDistance: 1,
    },
  ])

  const routeResult = executeCiscoCommand(state, 'show ip route')
  assert.match(routeResult.output, /S\s+172\.16\.0\.0\/16/)
  assert.match(routeResult.output, /S\*\s+0\.0\.0\.0\/0/)
})

test('supports a Layer 2 switch default gateway and route removal', () => {
  let state = runCommands([
    'enable',
    'configure terminal',
    'ip default-gateway 192.168.1.1',
    'ip route 10.0.0.0 255.0.0.0 192.168.1.254 5',
  ])

  assert.equal(state.defaultGateway, '192.168.1.1')
  assert.equal(state.staticRoutes[0].administrativeDistance, 5)

  const removal = executeCiscoCommand(
    state,
    'no ip route 10.0.0.0 255.0.0.0 192.168.1.254',
  )
  assert.equal(removal.accepted, true)
  state = removal.state
  assert.deepEqual(state.staticRoutes, [])
})

test('configures and verifies a single-area OSPF process', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'interface g0/0',
    'ip address 10.10.10.1 255.255.255.0',
    'no shutdown',
    'exit',
    'router ospf 10',
    'router-id 1.1.1.1',
    'network 10.10.10.0 0.0.0.255 area 0',
    'passive-interface default',
    'no passive-interface g0/0',
    'default-information originate',
    'end',
  ], 'R1')

  assert.deepEqual(state.ospfProcesses['10'], {
    routerId: '1.1.1.1',
    networks: [
      {
        network: '10.10.10.0',
        wildcard: '0.0.0.255',
        area: '0',
      },
    ],
    passiveDefault: true,
    passiveInterfaces: [],
    nonPassiveInterfaces: ['GigabitEthernet0/0'],
    defaultInformationOriginate: true,
  })

  const protocolResult = executeCiscoCommand(state, 'show ip protocols')
  assert.equal(protocolResult.accepted, true)
  assert.match(protocolResult.output, /ospf 10/)
  assert.match(protocolResult.output, /Router ID 1\.1\.1\.1/)
  assert.match(
    protocolResult.output,
    /10\.10\.10\.0 0\.0\.0\.255 area 0/,
  )

  const interfaceResult = executeCiscoCommand(
    state,
    'show ip ospf interface brief',
  )
  assert.equal(interfaceResult.accepted, true)
  assert.match(interfaceResult.output, /Gi0\/0/)
  assert.match(interfaceResult.output, /10\.10\.10\.1/)

  const runningResult = executeCiscoCommand(state, 'show running-config')
  assert.match(runningResult.output, /router ospf 10/)
  assert.match(runningResult.output, /no passive-interface GigabitEthernet0\/0/)
})

test('removes OSPF networks and processes independently of command order', () => {
  let state = runCommands([
    'enable',
    'configure terminal',
    'router ospf 20',
    'network 172.16.0.0 0.0.255.255 area 1',
    'router-id 2.2.2.2',
    'no network 172.16.0.0 0.0.255.255 area 1',
    'exit',
  ])

  assert.equal(state.ospfProcesses['20'].routerId, '2.2.2.2')
  assert.deepEqual(state.ospfProcesses['20'].networks, [])

  state = runCommands([
    'enable',
    'configure terminal',
    'router ospf 20',
    'router-id 2.2.2.2',
    'exit',
    'no router ospf 20',
  ])
  assert.deepEqual(state.ospfProcesses, {})
})

test('configures a numbered standard ACL and applies it inbound', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'access-list 10 permit 192.168.10.0 0.0.0.255',
    'access-list 10 deny any',
    'interface g0/0',
    'ip access-group 10 in',
    'end',
  ], 'R1')

  assert.equal(state.accessLists['10'].type, 'standard')
  assert.deepEqual(
    state.accessLists['10'].entries.map((entry) => entry.statement),
    [
      'permit 192.168.10.0 0.0.0.255',
      'deny any',
    ],
  )
  assert.equal(
    state.interfaces['GigabitEthernet0/0'].ipAccessGroups.in,
    '10',
  )

  const showResult = executeCiscoCommand(state, 'show access-lists 10')
  assert.equal(showResult.accepted, true)
  assert.match(showResult.output, /Standard IP access list 10/)
  assert.match(showResult.output, /permit 192\.168\.10\.0 0\.0\.0\.255/)
})

test('configures, edits, and applies a named extended ACL', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'ip access-list extended WEB-FILTER',
    '10 permit tcp any host 192.168.20.10 eq 80',
    '20 deny ip any any',
    'no 20',
    '30 permit icmp any any',
    'exit',
    'interface g0/1',
    'ip access-group WEB-FILTER out',
    'end',
  ], 'R1')

  assert.equal(state.accessLists['WEB-FILTER'].type, 'extended')
  assert.deepEqual(state.accessLists['WEB-FILTER'].entries, [
    {
      sequence: 10,
      statement: 'permit tcp any host 192.168.20.10 eq 80',
    },
    {
      sequence: 30,
      statement: 'permit icmp any any',
    },
  ])
  assert.equal(
    state.interfaces['GigabitEthernet0/1'].ipAccessGroups.out,
    'WEB-FILTER',
  )

  const runningResult = executeCiscoCommand(state, 'show running-config')
  assert.match(runningResult.output, /ip access-list extended WEB-FILTER/)
  assert.match(
    runningResult.output,
    /10 permit tcp any host 192\.168\.20\.10 eq 80/,
  )
  assert.match(runningResult.output, /ip access-group WEB-FILTER out/)
})
