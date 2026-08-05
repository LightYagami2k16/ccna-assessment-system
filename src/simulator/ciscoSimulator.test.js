import assert from 'node:assert/strict'
import test from 'node:test'
import {
  configurePcState,
  createDeviceState,
  executeCiscoCommand,
  executePcCommand,
  executeSshSessionCommand,
  executeTopologyCommand,
  normalizeInterface,
  parseVlanList,
  requestDhcpLease,
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
    loginLocal: false,
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
    natRole: '',
    channelGroup: null,
    spanningTreePortfast: false,
    spanningTreeBpduguard: false,
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

test('configures static NAT and inside and outside interface roles', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'interface g0/0',
    'ip nat inside',
    'exit',
    'interface g0/1',
    'ip nat outside',
    'exit',
    'ip nat inside source static 192.168.10.10 203.0.113.10',
    'end',
  ], 'R1')

  assert.equal(state.interfaces['GigabitEthernet0/0'].natRole, 'inside')
  assert.equal(state.interfaces['GigabitEthernet0/1'].natRole, 'outside')
  assert.deepEqual(state.natRules, [
    {
      type: 'static',
      localIp: '192.168.10.10',
      globalIp: '203.0.113.10',
    },
  ])

  const translations = executeCiscoCommand(state, 'show ip nat translations')
  assert.equal(translations.accepted, true)
  assert.match(translations.output, /203\.0\.113\.10/)
  assert.match(translations.output, /192\.168\.10\.10/)
})

test('configures a NAT pool and order-independent PAT rules', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'ip nat pool PUBLIC 203.0.113.10 203.0.113.20 netmask 255.255.255.0',
    'ip nat inside source list 10 interface g0/1 overload',
    'ip nat inside source list INSIDE-NETS pool public overload',
    'end',
  ], 'R1')

  assert.deepEqual(state.natPools.PUBLIC, {
    name: 'PUBLIC',
    startIp: '203.0.113.10',
    endIp: '203.0.113.20',
    netmask: '255.255.255.0',
  })
  assert.deepEqual(state.natRules, [
    {
      type: 'dynamic',
      aclId: '10',
      sourceType: 'interface',
      source: 'GigabitEthernet0/1',
      overload: true,
    },
    {
      type: 'dynamic',
      aclId: 'INSIDE-NETS',
      sourceType: 'pool',
      source: 'PUBLIC',
      overload: true,
    },
  ])

  const runningResult = executeCiscoCommand(state, 'show running-config')
  assert.match(
    runningResult.output,
    /ip nat pool PUBLIC 203\.0\.113\.10 203\.0\.113\.20 netmask 255\.255\.255\.0/,
  )
  assert.match(
    runningResult.output,
    /ip nat inside source list 10 interface GigabitEthernet0\/1 overload/,
  )
})

test('configures a DHCP pool and excluded address range', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'ip dhcp excluded-address 192.168.10.1 192.168.10.20',
    'ip dhcp pool USERS',
    'network 192.168.10.0 255.255.255.0',
    'default-router 192.168.10.1',
    'dns-server 8.8.8.8 1.1.1.1',
    'domain-name school.example',
    'lease 7',
    'end',
  ], 'R1')

  assert.deepEqual(state.dhcpExcludedRanges, [
    { startIp: '192.168.10.1', endIp: '192.168.10.20' },
  ])
  assert.deepEqual(state.dhcpPools.USERS, {
    name: 'USERS',
    network: '192.168.10.0',
    subnetMask: '255.255.255.0',
    defaultRouters: ['192.168.10.1'],
    dnsServers: ['8.8.8.8', '1.1.1.1'],
    domainName: 'school.example',
    lease: '7',
  })

  const showResult = executeCiscoCommand(state, 'show ip dhcp pool')
  assert.equal(showResult.accepted, true)
  assert.match(showResult.output, /Pool USERS/)
  assert.match(showResult.output, /192\.168\.10\.0/)
})

test('configures EtherChannel members using LACP', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'interface g0/1',
    'channel-group 1 mode active',
    'exit',
    'interface g0/2',
    'channel-group 1 mode passive',
    'end',
  ], 'SW1')

  assert.deepEqual(state.interfaces['GigabitEthernet0/1'].channelGroup, {
    id: 1,
    mode: 'active',
  })
  assert.ok(state.interfaces['Port-channel1'])

  const showResult = executeCiscoCommand(state, 'show etherchannel summary')
  assert.equal(showResult.accepted, true)
  assert.match(showResult.output, /Po1\(SU\)/)
  assert.match(showResult.output, /LACP/)
})

test('configures rapid PVST, VLAN priority, PortFast, and BPDU Guard', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'spanning-tree mode rapid-pvst',
    'spanning-tree vlan 10 priority 24576',
    'interface f0/1',
    'spanning-tree portfast',
    'spanning-tree bpduguard enable',
    'no shutdown',
    'end',
  ], 'SW1')

  assert.equal(state.spanningTree.mode, 'rapid-pvst')
  assert.equal(state.spanningTree.vlanPriorities['10'], 24576)
  assert.equal(state.interfaces['FastEthernet0/1'].spanningTreePortfast, true)
  assert.equal(state.interfaces['FastEthernet0/1'].spanningTreeBpduguard, true)

  const showResult = executeCiscoCommand(state, 'show spanning-tree vlan 10')
  assert.equal(showResult.accepted, true)
  assert.match(showResult.output, /protocol rstp/)
  assert.match(showResult.output, /Priority\s+24586/)
})

test('configures SSH version 2 with RSA keys and local VTY login', () => {
  const state = runCommands([
    'enable',
    'configure terminal',
    'hostname R1',
    'ip domain-name school.example',
    'username admin secret class',
    'crypto key generate rsa modulus 2048',
    'ip ssh version 2',
    'line vty 0 4',
    'login local',
    'transport input ssh',
    'end',
  ], 'Router')

  assert.equal(state.rsaKeyBits, 2048)
  assert.equal(state.sshVersion, 2)
  assert.equal(state.lines.vty.loginLocal, true)
  assert.equal(state.lines.vty.transportInput, 'ssh')

  const showResult = executeCiscoCommand(state, 'show ip ssh')
  assert.equal(showResult.accepted, true)
  assert.match(showResult.output, /SSH Enabled - version 2/)
  assert.match(showResult.output, /2048 bits/)
})

test('accepts common IOS SSH configuration and client command variants', () => {
  const fixture = directRouterTopology()
  const deviceStates = {
    r1: runCommands([
      'enable', 'configure terminal',
      'interface g0/0', 'ip address 10.0.0.1 255.255.255.252',
      'no shutdown', 'end',
    ], 'R1'),
    r2: runCommands([
      'enable', 'configure terminal',
      'hostname R2',
      'ip domain-name school.example',
      'username admin privilege 15 password class',
      'crypto key generate rsa',
      'line vty 0 15', 'login local', 'transport input ssh', 'exit',
      'interface g0/0', 'ip address 10.0.0.2 255.255.255.252',
      'no shutdown', 'end',
    ], 'R2'),
  }

  assert.equal(deviceStates.r2.rsaKeyBits, 2048)
  assert.deepEqual(deviceStates.r2.users.admin, {
    secret: 'class',
    credentialType: 'password',
    privilege: 15,
  })

  const result = executeTopologyCommand({
    deviceStates,
    devices: fixture.devices,
    activeDeviceId: 'r1',
    topology: fixture.topology,
    rawCommand: 'ssh -v 2 -l admin 10.0.0.2',
  })

  assert.match(result.output, /Connection to 10\.0\.0\.2 established/)
  assert.deepEqual(result.state.successfulSshConnections, [
    'admin@10.0.0.2',
  ])
})

test('keeps independent configuration state for multiple topology devices', () => {
  const routerState = runCommands([
    'enable',
    'configure terminal',
    'hostname R1',
    'interface g0/0',
    'ip address 10.0.0.1 255.255.255.252',
    'no shutdown',
  ], 'Router')
  const switchState = runCommands([
    'enable',
    'configure terminal',
    'hostname SW1',
    'vlan 10',
    'name USERS',
  ])

  const deviceStates = {
    router: routerState,
    switch: switchState,
  }

  assert.equal(deviceStates.router.hostname, 'R1')
  assert.equal(
    deviceStates.router.interfaces['GigabitEthernet0/0'].ipAddress,
    '10.0.0.1',
  )
  assert.equal(deviceStates.switch.hostname, 'SW1')
  assert.equal(deviceStates.switch.vlans['10'].name, 'USERS')
  assert.equal(deviceStates.router.vlans['10'], undefined)
  assert.equal(deviceStates.switch.interfaces['GigabitEthernet0/0'], undefined)
})

test('simulates ping success only across active topology links', () => {
  const deviceStates = {
    r1: runCommands([
      'enable',
      'configure terminal',
      'interface g0/0',
      'ip address 10.0.0.1 255.255.255.252',
      'no shutdown',
      'end',
    ], 'R1'),
    r2: runCommands([
      'enable',
      'configure terminal',
      'interface g0/0',
      'ip address 10.0.0.2 255.255.255.252',
      'no shutdown',
      'end',
    ], 'R2'),
  }
  const topology = {
    links: [{
      id: 'r1-r2',
      fromDeviceId: 'r1',
      fromInterface: 'g0/0',
      toDeviceId: 'r2',
      toInterface: 'g0/0',
    }],
  }

  const result = executeTopologyCommand({
    deviceStates,
    activeDeviceId: 'r1',
    topology,
    rawCommand: 'ping 10.0.0.2',
  })

  assert.equal(result.accepted, true)
  assert.match(result.output, /!!!!!/)
  assert.match(result.output, /Success rate is 100 percent/)
  assert.deepEqual(result.state.successfulPings, ['10.0.0.2'])

  deviceStates.r2.interfaces['GigabitEthernet0/0'].shutdown = true
  const failed = executeTopologyCommand({
    deviceStates,
    activeDeviceId: 'r1',
    topology,
    rawCommand: 'ping 10.0.0.2',
  })
  assert.match(failed.output, /\.\.\.\.\./)
  assert.match(failed.output, /Success rate is 0 percent/)
})

test('requires forward and return routes across multi-router topology paths', () => {
  const r1Commands = [
    'enable',
    'configure terminal',
    'interface g0/0',
    'ip address 10.0.12.1 255.255.255.252',
    'no shutdown',
    'exit',
  ]
  const r3Commands = [
    'enable',
    'configure terminal',
    'interface g0/0',
    'ip address 10.0.23.2 255.255.255.252',
    'no shutdown',
    'exit',
    'ip route 10.0.12.0 255.255.255.252 10.0.23.1',
    'end',
  ]
  const deviceStates = {
    r1: runCommands([...r1Commands, 'end'], 'R1'),
    r2: runCommands([
      'enable',
      'configure terminal',
      'interface g0/0',
      'ip address 10.0.12.2 255.255.255.252',
      'no shutdown',
      'exit',
      'interface g0/1',
      'ip address 10.0.23.1 255.255.255.252',
      'no shutdown',
      'end',
    ], 'R2'),
    r3: runCommands(r3Commands, 'R3'),
  }
  const devices = [
    { id: 'r1', type: 'router', label: 'R1' },
    { id: 'r2', type: 'router', label: 'R2' },
    { id: 'r3', type: 'router', label: 'R3' },
  ]
  const topology = {
    links: [
      {
        id: 'r1-r2',
        fromDeviceId: 'r1',
        fromInterface: 'g0/0',
        toDeviceId: 'r2',
        toInterface: 'g0/0',
      },
      {
        id: 'r2-r3',
        fromDeviceId: 'r2',
        fromInterface: 'g0/1',
        toDeviceId: 'r3',
        toInterface: 'g0/0',
      },
    ],
  }

  const missingForwardRoute = executeTopologyCommand({
    deviceStates,
    devices,
    activeDeviceId: 'r1',
    topology,
    rawCommand: 'ping 10.0.23.2',
  })
  assert.match(missingForwardRoute.output, /Success rate is 0 percent/)

  deviceStates.r1 = runCommands([
    ...r1Commands,
    'ip route 10.0.23.0 255.255.255.252 10.0.12.2',
    'end',
  ], 'R1')
  const routedPing = executeTopologyCommand({
    deviceStates,
    devices,
    activeDeviceId: 'r1',
    topology,
    rawCommand: 'ping 10.0.23.2',
  })
  assert.match(routedPing.output, /Success rate is 100 percent/)
  assert.deepEqual(routedPing.state.successfulPings, ['10.0.23.2'])
})

test('records successful traceroute criteria across routed devices', () => {
  const deviceStates = {
    r1: runCommands([
      'enable',
      'configure terminal',
      'interface g0/0',
      'ip address 10.0.12.1 255.255.255.252',
      'no shutdown',
      'exit',
      'ip route 10.0.23.0 255.255.255.252 10.0.12.2',
      'end',
    ], 'R1'),
    r2: runCommands([
      'enable',
      'configure terminal',
      'interface g0/0',
      'ip address 10.0.12.2 255.255.255.252',
      'no shutdown',
      'exit',
      'interface g0/1',
      'ip address 10.0.23.1 255.255.255.252',
      'no shutdown',
      'end',
    ], 'R2'),
    r3: runCommands([
      'enable',
      'configure terminal',
      'interface g0/0',
      'ip address 10.0.23.2 255.255.255.252',
      'no shutdown',
      'end',
    ], 'R3'),
  }
  const result = executeTopologyCommand({
    deviceStates,
    devices: [
      { id: 'r1', type: 'router', label: 'R1' },
      { id: 'r2', type: 'router', label: 'R2' },
      { id: 'r3', type: 'router', label: 'R3' },
    ],
    activeDeviceId: 'r1',
    topology: {
      links: [
        {
          id: 'r1-r2',
          fromDeviceId: 'r1',
          fromInterface: 'g0/0',
          toDeviceId: 'r2',
          toInterface: 'g0/0',
        },
        {
          id: 'r2-r3',
          fromDeviceId: 'r2',
          fromInterface: 'g0/1',
          toDeviceId: 'r3',
          toInterface: 'g0/0',
        },
      ],
    },
    rawCommand: 'traceroute 10.0.23.2',
  })

  assert.equal(result.accepted, true)
  assert.match(result.output, /R2/)
  assert.match(result.output, /R3/)
  assert.match(result.output, /Trace complete/)
  assert.deepEqual(result.state.successfulTraceroutes, ['10.0.23.2'])
})

test('opens SSH only when reachability and secure VTY configuration are valid', () => {
  const fixture = directRouterTopology()
  const deviceStates = {
    r1: runCommands([
      'enable', 'configure terminal',
      'interface g0/0', 'ip address 10.0.0.1 255.255.255.252',
      'no shutdown', 'end',
    ], 'R1'),
    r2: runCommands([
      'enable', 'configure terminal',
      'hostname R2',
      'ip domain-name school.example',
      'username admin secret class',
      'crypto key generate rsa modulus 2048',
      'ip ssh version 2',
      'line vty 0 4', 'login local', 'transport input ssh', 'exit',
      'interface g0/0', 'ip address 10.0.0.2 255.255.255.252',
      'no shutdown', 'end',
    ], 'R2'),
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices: fixture.devices,
    activeDeviceId: 'r1',
    topology: fixture.topology,
    rawCommand: 'ssh -l admin 10.0.0.2',
  })

  assert.match(result.output, /Connection to 10\.0\.0\.2 established/)
  assert.deepEqual(result.state.successfulSshConnections, [
    'admin@10.0.0.2',
  ])
})

test('refuses SSH when the target VTY lines do not use local login', () => {
  const fixture = directRouterTopology()
  const deviceStates = {
    r1: runCommands([
      'enable', 'configure terminal',
      'interface g0/0', 'ip address 10.0.0.1 255.255.255.252',
      'no shutdown', 'end',
    ], 'R1'),
    r2: runCommands([
      'enable', 'configure terminal',
      'ip domain-name school.example',
      'username admin secret class',
      'crypto key generate rsa modulus 2048',
      'ip ssh version 2',
      'line vty 0 4', 'password legacy', 'login',
      'transport input ssh', 'exit',
      'interface g0/0', 'ip address 10.0.0.2 255.255.255.252',
      'no shutdown', 'end',
    ], 'R2'),
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices: fixture.devices,
    activeDeviceId: 'r1',
    topology: fixture.topology,
    rawCommand: 'ssh -l admin 10.0.0.2',
  })

  assert.match(result.output, /Connection refused/)
  assert.deepEqual(result.state.successfulSshConnections, [])
})

test('configures a PC IPv4 address and default gateway from its prompt', () => {
  let state = createDeviceState('PC1', 'pc')

  let result = executePcCommand(
    state,
    'ipconfig /ip 192.168.10.10 255.255.255.0',
  )
  assert.equal(result.accepted, true)
  state = result.state

  result = executePcCommand(state, 'ipconfig /gateway 192.168.10.1')
  assert.equal(result.accepted, true)
  state = result.state

  const display = executePcCommand(state, 'ipconfig /all')
  assert.match(display.output, /192\.168\.10\.10/)
  assert.match(display.output, /255\.255\.255\.0/)
  assert.match(display.output, /192\.168\.10\.1/)
})

test('applies PC IPv4 and DNS settings from the configuration panel', () => {
  const result = configurePcState(createDeviceState('PC1', 'pc'), {
    ipAddress: '192.168.56.10',
    subnetMask: '255.255.255.0',
    defaultGateway: '192.168.56.1',
    preferredDns: '8.8.8.8',
    alternateDns: '1.1.1.1',
  })

  assert.equal(result.accepted, true)
  assert.equal(
    result.state.interfaces.Ethernet0.ipAddress,
    '192.168.56.10',
  )
  assert.equal(result.state.defaultGateway, '192.168.56.1')
  assert.deepEqual(result.state.dnsServers, ['8.8.8.8', '1.1.1.1'])

  const invalidGateway = configurePcState(result.state, {
    ipAddress: '192.168.56.10',
    subnetMask: '255.255.255.0',
    defaultGateway: '10.0.0.1',
  })
  assert.equal(invalidGateway.accepted, false)
  assert.match(invalidGateway.error, /same subnet/i)
})

test('supports PC-to-router ping through an active access switch', () => {
  let pcState = createDeviceState('PC1', 'pc')
  pcState = executePcCommand(
    pcState,
    'ipconfig /ip 192.168.10.10 255.255.255.0',
  ).state
  pcState = executePcCommand(
    pcState,
    'ipconfig /gateway 192.168.10.1',
  ).state

  const deviceStates = {
    pc1: pcState,
    sw1: runCommands([
      'enable',
      'configure terminal',
      'interface f0/1',
      'no shutdown',
      'exit',
      'interface f0/24',
      'no shutdown',
      'end',
    ], 'SW1'),
    r1: runCommands([
      'enable',
      'configure terminal',
      'interface g0/0',
      'ip address 192.168.10.1 255.255.255.0',
      'no shutdown',
      'end',
    ], 'R1'),
  }
  const devices = [
    { id: 'pc1', type: 'pc', label: 'Student PC' },
    { id: 'sw1', type: 'switch', label: 'Access switch' },
    { id: 'r1', type: 'router', label: 'Gateway router' },
  ]
  const topology = {
    links: [
      {
        id: 'pc-switch',
        fromDeviceId: 'pc1',
        fromInterface: 'Ethernet0',
        toDeviceId: 'sw1',
        toInterface: 'FastEthernet0/1',
      },
      {
        id: 'switch-router',
        fromDeviceId: 'sw1',
        fromInterface: 'FastEthernet0/24',
        toDeviceId: 'r1',
        toInterface: 'GigabitEthernet0/0',
      },
    ],
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices,
    activeDeviceId: 'pc1',
    topology,
    rawCommand: 'ping 192.168.10.1',
  })

  assert.equal(result.accepted, true)
  assert.match(result.output, /Success rate is 100 percent/)
  assert.deepEqual(result.state.successfulPings, ['192.168.10.1'])
})

test('opens SSH from a PC to a Layer 2 switch management SVI', () => {
  const pcState = configurePcState(createDeviceState('PC1', 'pc'), {
    ipAddress: '192.168.0.2',
    subnetMask: '255.255.255.0',
    defaultGateway: '192.168.0.1',
  }).state
  const switchState = runCommands([
    'enable', 'configure terminal',
    'ip domain-name uc.edu.ph',
    'username admin secret admin',
    'crypto key generate rsa modulus 2048',
    'ip ssh version 2',
    'line vty 0 4', 'login local', 'transport input ssh', 'exit',
    'interface vlan 1',
    'ip address 192.168.0.1 255.255.255.0',
    'no shutdown', 'exit',
    'interface f0/1',
    'switchport mode access',
    'switchport access vlan 1',
    'no shutdown', 'end',
  ], 'Switch')
  const deviceStates = { pc: pcState, switch: switchState }
  const devices = [
    { id: 'switch', type: 'switch', label: 'Switch' },
    { id: 'pc', type: 'pc', label: 'PC' },
  ]
  const topology = {
    links: [{
      id: 'pc-switch',
      fromDeviceId: 'pc',
      fromInterface: 'Ethernet0',
      toDeviceId: 'switch',
      toInterface: 'FastEthernet0/1',
    }],
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices,
    activeDeviceId: 'pc',
    topology,
    rawCommand: 'ssh admin@192.168.0.1',
  })

  assert.equal(result.accepted, true)
  assert.match(result.output, /Connection to 192\.168\.0\.1 established/)
  assert.deepEqual(result.state.successfulSshConnections, [
    'admin@192.168.0.1',
  ])

  deviceStates.pc = result.state
  let remoteResult = executeSshSessionCommand({
    deviceStates,
    activeDeviceId: 'pc',
    rawCommand: 'configure terminal',
  })
  assert.equal(remoteResult.accepted, true)
  assert.equal(remoteResult.state.sshSession.remoteMode, 'global_config')
  deviceStates.pc = remoteResult.state
  deviceStates.switch = remoteResult.destinationState

  remoteResult = executeSshSessionCommand({
    deviceStates,
    activeDeviceId: 'pc',
    rawCommand: 'hostname SW1',
  })
  assert.equal(remoteResult.destinationState.hostname, 'SW1')
  assert.equal(remoteResult.state.sshSession.remoteMode, 'global_config')
  deviceStates.pc = remoteResult.state
  deviceStates.switch = remoteResult.destinationState

  remoteResult = executeSshSessionCommand({
    deviceStates,
    activeDeviceId: 'pc',
    rawCommand: 'end',
  })
  assert.equal(remoteResult.state.sshSession.remoteMode, 'privileged_exec')
  deviceStates.pc = remoteResult.state
  deviceStates.switch = remoteResult.destinationState

  remoteResult = executeSshSessionCommand({
    deviceStates,
    activeDeviceId: 'pc',
    rawCommand: 'exit',
  })
  assert.equal(remoteResult.sessionClosed, true)
  assert.equal(remoteResult.state.sshSession, undefined)
  assert.match(remoteResult.output, /Connection to 192\.168\.0\.1 closed/)
})

function createAccessSwitch(hostname, accessInterface, accessVlan, trunkInterface, allowedVlans) {
  return runCommands([
    'enable',
    'configure terminal',
    `vlan ${accessVlan}`,
    'exit',
    `interface ${accessInterface}`,
    'switchport mode access',
    `switchport access vlan ${accessVlan}`,
    'no shutdown',
    'exit',
    `interface ${trunkInterface}`,
    'switchport mode trunk',
    `switchport trunk allowed vlan ${allowedVlans}`,
    'no shutdown',
    'end',
  ], hostname)
}

function createConfiguredPc(hostname, ipAddress) {
  return configurePcState(createDeviceState(hostname, 'pc'), {
    ipAddress,
    subnetMask: '255.255.255.0',
  }).state
}

function twoSwitchPcTopology() {
  return {
    devices: [
      { id: 'pc1', type: 'pc', label: 'PC1' },
      { id: 'sw1', type: 'switch', label: 'SW1' },
      { id: 'sw2', type: 'switch', label: 'SW2' },
      { id: 'pc2', type: 'pc', label: 'PC2' },
    ],
    topology: {
      links: [
        {
          id: 'pc1-sw1',
          fromDeviceId: 'pc1',
          fromInterface: 'Ethernet0',
          toDeviceId: 'sw1',
          toInterface: 'FastEthernet0/1',
        },
        {
          id: 'sw1-sw2',
          fromDeviceId: 'sw1',
          fromInterface: 'GigabitEthernet0/1',
          toDeviceId: 'sw2',
          toInterface: 'GigabitEthernet0/1',
        },
        {
          id: 'sw2-pc2',
          fromDeviceId: 'sw2',
          fromInterface: 'FastEthernet0/1',
          toDeviceId: 'pc2',
          toInterface: 'Ethernet0',
        },
      ],
    },
  }
}

test('forwards same-VLAN PC traffic across an allowed switch trunk', () => {
  const fixture = twoSwitchPcTopology()
  const deviceStates = {
    pc1: createConfiguredPc('PC1', '192.168.10.10'),
    sw1: createAccessSwitch('SW1', 'f0/1', 10, 'g0/1', '10'),
    sw2: createAccessSwitch('SW2', 'f0/1', 10, 'g0/1', '10'),
    pc2: createConfiguredPc('PC2', '192.168.10.20'),
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices: fixture.devices,
    activeDeviceId: 'pc1',
    topology: fixture.topology,
    rawCommand: 'ping 192.168.10.20',
  })

  assert.match(result.output, /Success rate is 100 percent/)
})

test('blocks PC traffic when access VLAN membership differs', () => {
  const fixture = twoSwitchPcTopology()
  const deviceStates = {
    pc1: createConfiguredPc('PC1', '192.168.10.10'),
    sw1: createAccessSwitch('SW1', 'f0/1', 10, 'g0/1', '10,20'),
    sw2: createAccessSwitch('SW2', 'f0/1', 20, 'g0/1', '10,20'),
    pc2: createConfiguredPc('PC2', '192.168.10.20'),
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices: fixture.devices,
    activeDeviceId: 'pc1',
    topology: fixture.topology,
    rawCommand: 'ping 192.168.10.20',
  })

  assert.match(result.output, /Success rate is 0 percent/)
})

test('blocks a VLAN excluded from either side of a switch trunk', () => {
  const fixture = twoSwitchPcTopology()
  const deviceStates = {
    pc1: createConfiguredPc('PC1', '192.168.10.10'),
    sw1: createAccessSwitch('SW1', 'f0/1', 10, 'g0/1', '20'),
    sw2: createAccessSwitch('SW2', 'f0/1', 10, 'g0/1', '10'),
    pc2: createConfiguredPc('PC2', '192.168.10.20'),
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices: fixture.devices,
    activeDeviceId: 'pc1',
    topology: fixture.topology,
    rawCommand: 'ping 192.168.10.20',
  })

  assert.match(result.output, /Success rate is 0 percent/)
})

test('maps untagged trunk traffic through matching native VLANs', () => {
  const fixture = twoSwitchPcTopology()
  const deviceStates = {
    pc1: createConfiguredPc('PC1', '192.168.99.10'),
    sw1: runCommands([
      'enable', 'configure terminal',
      'interface f0/1', 'switchport mode access',
      'switchport access vlan 99', 'no shutdown', 'exit',
      'interface g0/1', 'switchport mode trunk',
      'switchport trunk native vlan 99',
      'switchport trunk allowed vlan 99', 'no shutdown', 'end',
    ], 'SW1'),
    sw2: runCommands([
      'enable', 'configure terminal',
      'interface f0/1', 'switchport mode access',
      'switchport access vlan 99', 'no shutdown', 'exit',
      'interface g0/1', 'switchport mode trunk',
      'switchport trunk native vlan 99',
      'switchport trunk allowed vlan 99', 'no shutdown', 'end',
    ], 'SW2'),
    pc2: createConfiguredPc('PC2', '192.168.99.20'),
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices: fixture.devices,
    activeDeviceId: 'pc1',
    topology: fixture.topology,
    rawCommand: 'ping 192.168.99.20',
  })

  assert.match(result.output, /Success rate is 100 percent/)
})

function etherchannelSwitch(hostname, mode, secondMode = mode) {
  return runCommands([
    'enable', 'configure terminal',
    'vlan 10', 'exit',
    'interface f0/1', 'switchport mode access',
    'switchport access vlan 10', 'no shutdown', 'exit',
    'interface g0/1', `channel-group 1 mode ${mode}`,
    'no shutdown', 'exit',
    'interface g0/2', `channel-group 1 mode ${secondMode}`,
    'no shutdown', 'exit',
    'interface port-channel 1', 'switchport mode trunk',
    'switchport trunk allowed vlan 10', 'no shutdown', 'end',
  ], hostname)
}

function etherchannelTopology() {
  const fixture = twoSwitchPcTopology()
  fixture.topology.links.splice(1, 1,
    {
      id: 'sw1-sw2-member-1', fromDeviceId: 'sw1',
      fromInterface: 'GigabitEthernet0/1', toDeviceId: 'sw2',
      toInterface: 'GigabitEthernet0/1',
    },
    {
      id: 'sw1-sw2-member-2', fromDeviceId: 'sw1',
      fromInterface: 'GigabitEthernet0/2', toDeviceId: 'sw2',
      toInterface: 'GigabitEthernet0/2',
    },
  )
  return fixture
}

function pingAcrossEtherchannel(sw1, sw2) {
  const fixture = etherchannelTopology()
  return executeTopologyCommand({
    deviceStates: {
      pc1: createConfiguredPc('PC1', '192.168.10.10'),
      sw1,
      sw2,
      pc2: createConfiguredPc('PC2', '192.168.10.20'),
    },
    devices: fixture.devices,
    activeDeviceId: 'pc1',
    topology: fixture.topology,
    rawCommand: 'ping 192.168.10.20',
  })
}

test('forwards a VLAN through a negotiated LACP EtherChannel', () => {
  const result = pingAcrossEtherchannel(
    etherchannelSwitch('SW1', 'active'),
    etherchannelSwitch('SW2', 'passive'),
  )

  assert.match(result.output, /Success rate is 100 percent/)
})

test('keeps an EtherChannel forwarding when one member link fails', () => {
  const sw1 = etherchannelSwitch('SW1', 'active')
  sw1.interfaces['GigabitEthernet0/1'].shutdown = true
  const result = pingAcrossEtherchannel(
    sw1,
    etherchannelSwitch('SW2', 'passive'),
  )

  assert.match(result.output, /Success rate is 100 percent/)
})

test('does not form an LACP EtherChannel with two passive endpoints', () => {
  const result = pingAcrossEtherchannel(
    etherchannelSwitch('SW1', 'passive'),
    etherchannelSwitch('SW2', 'passive'),
  )

  assert.match(result.output, /Success rate is 0 percent/)
})

test('does not form an EtherChannel across mismatched protocols', () => {
  const result = pingAcrossEtherchannel(
    etherchannelSwitch('SW1', 'active'),
    etherchannelSwitch('SW2', 'desirable'),
  )

  assert.match(result.output, /Success rate is 0 percent/)
})

function stpTriangleSwitch(hostname, root = false) {
  return runCommands([
    'enable', 'configure terminal',
    'spanning-tree mode rapid-pvst',
    ...(root ? ['spanning-tree vlan 10 root primary'] : []),
    'vlan 10', 'exit',
    'interface f0/1', 'switchport mode access',
    'switchport access vlan 10', 'no shutdown', 'exit',
    'interface g0/1', 'switchport mode trunk',
    'switchport trunk allowed vlan 10', 'no shutdown', 'exit',
    'interface g0/2', 'switchport mode trunk',
    'switchport trunk allowed vlan 10', 'no shutdown', 'end',
  ], hostname)
}

function stpTriangleFixture() {
  return {
    deviceStates: {
      pc1: createConfiguredPc('PC1', '192.168.10.10'),
      sw1: stpTriangleSwitch('SW1', true),
      sw2: stpTriangleSwitch('SW2'),
      sw3: stpTriangleSwitch('SW3'),
      pc2: createConfiguredPc('PC2', '192.168.10.20'),
    },
    devices: [
      { id: 'pc1', type: 'pc', label: 'PC1' },
      { id: 'sw1', type: 'switch', label: 'SW1' },
      { id: 'sw2', type: 'switch', label: 'SW2' },
      { id: 'sw3', type: 'switch', label: 'SW3' },
      { id: 'pc2', type: 'pc', label: 'PC2' },
    ],
    topology: {
      links: [
        {
          id: 'pc1-sw2', fromDeviceId: 'pc1',
          fromInterface: 'Ethernet0', toDeviceId: 'sw2',
          toInterface: 'FastEthernet0/1',
        },
        {
          id: 'sw1-sw2', fromDeviceId: 'sw1',
          fromInterface: 'GigabitEthernet0/1', toDeviceId: 'sw2',
          toInterface: 'GigabitEthernet0/1',
        },
        {
          id: 'sw1-sw3', fromDeviceId: 'sw1',
          fromInterface: 'GigabitEthernet0/2', toDeviceId: 'sw3',
          toInterface: 'GigabitEthernet0/1',
        },
        {
          id: 'sw2-sw3', fromDeviceId: 'sw2',
          fromInterface: 'GigabitEthernet0/2', toDeviceId: 'sw3',
          toInterface: 'GigabitEthernet0/2',
        },
        {
          id: 'sw3-pc2', fromDeviceId: 'sw3',
          fromInterface: 'FastEthernet0/1', toDeviceId: 'pc2',
          toInterface: 'Ethernet0',
        },
      ],
    },
  }
}

test('blocks a redundant VLAN path according to the STP root tree', () => {
  const fixture = stpTriangleFixture()
  const result = executeTopologyCommand({
    ...fixture,
    activeDeviceId: 'pc1',
    rawCommand: 'tracert 192.168.10.20',
  })

  assert.match(result.output, /SW1/)
  assert.match(result.output, /Trace complete/)
})

test('reconverges STP onto a backup link after a forwarding link fails', () => {
  const fixture = stpTriangleFixture()
  fixture.deviceStates.sw1.interfaces['GigabitEthernet0/2'].shutdown = true
  const result = executeTopologyCommand({
    ...fixture,
    activeDeviceId: 'pc1',
    rawCommand: 'ping 192.168.10.20',
  })

  assert.match(result.output, /Success rate is 100 percent/)
})

test('routes between access VLANs through router-on-a-stick subinterfaces', () => {
  const deviceStates = {
    pc10: configurePcState(createDeviceState('PC10', 'pc'), {
      ipAddress: '192.168.10.10',
      subnetMask: '255.255.255.0',
      defaultGateway: '192.168.10.1',
    }).state,
    sw1: runCommands([
      'enable', 'configure terminal',
      'interface f0/1', 'switchport mode access',
      'switchport access vlan 10', 'no shutdown', 'exit',
      'interface f0/2', 'switchport mode access',
      'switchport access vlan 20', 'no shutdown', 'exit',
      'interface g0/1', 'switchport mode trunk',
      'switchport trunk allowed vlan 10,20', 'no shutdown', 'end',
    ], 'SW1'),
    r1: runCommands([
      'enable', 'configure terminal',
      'interface g0/0.10', 'encapsulation dot1q 10',
      'ip address 192.168.10.1 255.255.255.0', 'no shutdown', 'exit',
      'interface g0/0.20', 'encapsulation dot1q 20',
      'ip address 192.168.20.1 255.255.255.0', 'no shutdown', 'end',
    ], 'R1'),
    pc20: configurePcState(createDeviceState('PC20', 'pc'), {
      ipAddress: '192.168.20.20',
      subnetMask: '255.255.255.0',
      defaultGateway: '192.168.20.1',
    }).state,
  }
  const devices = [
    { id: 'pc10', type: 'pc', label: 'PC10' },
    { id: 'sw1', type: 'switch', label: 'SW1' },
    { id: 'r1', type: 'router', label: 'R1' },
    { id: 'pc20', type: 'pc', label: 'PC20' },
  ]
  const topology = {
    links: [
      {
        id: 'pc10-sw1', fromDeviceId: 'pc10',
        fromInterface: 'Ethernet0', toDeviceId: 'sw1',
        toInterface: 'FastEthernet0/1',
      },
      {
        id: 'sw1-r1', fromDeviceId: 'sw1',
        fromInterface: 'GigabitEthernet0/1', toDeviceId: 'r1',
        toInterface: 'GigabitEthernet0/0',
      },
      {
        id: 'sw1-pc20', fromDeviceId: 'sw1',
        fromInterface: 'FastEthernet0/2', toDeviceId: 'pc20',
        toInterface: 'Ethernet0',
      },
    ],
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices,
    activeDeviceId: 'pc10',
    topology,
    rawCommand: 'ping 192.168.20.20',
  })

  assert.match(result.output, /Success rate is 100 percent/)
})

function directRouterTopology() {
  return {
    devices: [
      { id: 'r1', type: 'router', label: 'R1' },
      { id: 'r2', type: 'router', label: 'R2' },
    ],
    topology: {
      links: [{
        id: 'r1-r2',
        fromDeviceId: 'r1',
        fromInterface: 'GigabitEthernet0/0',
        toDeviceId: 'r2',
        toInterface: 'GigabitEthernet0/0',
      }],
    },
  }
}

test('learns remote topology networks through single-area OSPF neighbors', () => {
  const deviceStates = {
    r1: runCommands([
      'enable', 'configure terminal',
      'interface g0/0', 'ip address 10.0.12.1 255.255.255.252',
      'no shutdown', 'exit',
      'router ospf 1',
      'network 0.0.0.0 255.255.255.255 area 0',
      'end',
    ], 'R1'),
    r2: runCommands([
      'enable', 'configure terminal',
      'interface g0/0', 'ip address 10.0.12.2 255.255.255.252',
      'no shutdown', 'exit',
      'interface g0/1', 'ip address 10.0.23.1 255.255.255.252',
      'no shutdown', 'exit',
      'router ospf 1',
      'network 0.0.0.0 255.255.255.255 area 0',
      'end',
    ], 'R2'),
    r3: runCommands([
      'enable', 'configure terminal',
      'interface g0/0', 'ip address 10.0.23.2 255.255.255.252',
      'no shutdown', 'exit',
      'interface g0/1', 'ip address 192.168.30.1 255.255.255.0',
      'no shutdown', 'exit',
      'router ospf 1',
      'network 0.0.0.0 255.255.255.255 area 0',
      'end',
    ], 'R3'),
  }
  const devices = [
    { id: 'r1', type: 'router', label: 'R1' },
    { id: 'r2', type: 'router', label: 'R2' },
    { id: 'r3', type: 'router', label: 'R3' },
  ]
  const topology = {
    links: [
      {
        id: 'r1-r2',
        fromDeviceId: 'r1', fromInterface: 'GigabitEthernet0/0',
        toDeviceId: 'r2', toInterface: 'GigabitEthernet0/0',
      },
      {
        id: 'r2-r3',
        fromDeviceId: 'r2', fromInterface: 'GigabitEthernet0/1',
        toDeviceId: 'r3', toInterface: 'GigabitEthernet0/0',
      },
    ],
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices,
    activeDeviceId: 'r1',
    topology,
    rawCommand: 'ping 192.168.30.1',
  })

  assert.equal(result.accepted, true)
  assert.match(result.output, /Success rate is 100 percent/)
  assert.deepEqual(result.state.successfulPings, ['192.168.30.1'])

  const routeOutput = executeTopologyCommand({
    deviceStates,
    devices,
    activeDeviceId: 'r1',
    topology,
    rawCommand: 'show ip route ospf',
  })
  assert.match(routeOutput.output, /O\s+192\.168\.30\.0\/24/)
  assert.match(routeOutput.output, /via 10\.0\.12\.2/)

  const neighborOutput = executeTopologyCommand({
    deviceStates,
    devices,
    activeDeviceId: 'r1',
    topology,
    rawCommand: 'show ip ospf neighbor',
  })
  assert.match(neighborOutput.output, /FULL\/DR/)
  assert.match(neighborOutput.output, /10\.0\.12\.2/)
})

test('forms OSPF neighbors across a shared switched access VLAN', () => {
  const deviceStates = {
    r1: runCommands([
      'enable', 'configure terminal',
      'interface g0/0', 'ip address 10.10.10.1 255.255.255.0',
      'no shutdown', 'exit',
      'router ospf 10',
      'network 10.10.10.0 0.0.0.255 area 0',
      'end',
    ], 'R1'),
    sw1: runCommands([
      'enable', 'configure terminal',
      'vlan 10', 'exit',
      'interface f0/1', 'switchport mode access',
      'switchport access vlan 10', 'no shutdown', 'exit',
      'interface f0/2', 'switchport mode access',
      'switchport access vlan 10', 'no shutdown', 'end',
    ], 'SW1'),
    r2: runCommands([
      'enable', 'configure terminal',
      'interface g0/0', 'ip address 10.10.10.2 255.255.255.0',
      'no shutdown', 'exit',
      'interface g0/1', 'ip address 192.168.50.1 255.255.255.0',
      'no shutdown', 'exit',
      'router ospf 20',
      'network 10.10.10.0 0.0.0.255 area 0',
      'network 192.168.50.0 0.0.0.255 area 0',
      'end',
    ], 'R2'),
  }
  const devices = [
    { id: 'r1', type: 'router', label: 'R1' },
    { id: 'sw1', type: 'switch', label: 'SW1' },
    { id: 'r2', type: 'router', label: 'R2' },
  ]
  const topology = {
    links: [
      {
        id: 'r1-sw1',
        fromDeviceId: 'r1', fromInterface: 'GigabitEthernet0/0',
        toDeviceId: 'sw1', toInterface: 'FastEthernet0/1',
      },
      {
        id: 'sw1-r2',
        fromDeviceId: 'sw1', fromInterface: 'FastEthernet0/2',
        toDeviceId: 'r2', toInterface: 'GigabitEthernet0/0',
      },
    ],
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices,
    activeDeviceId: 'r1',
    topology,
    rawCommand: 'ping 192.168.50.1',
  })
  assert.match(result.output, /Success rate is 100 percent/)

  const neighbors = executeTopologyCommand({
    deviceStates,
    devices,
    activeDeviceId: 'r1',
    topology,
    rawCommand: 'show ip ospf neighbor',
  })
  assert.match(neighbors.output, /10\.10\.10\.2/)
})

test('enforces a standard ACL applied inbound on a topology interface', () => {
  const fixture = directRouterTopology()
  const deviceStates = {
    r1: runCommands([
      'enable', 'configure terminal',
      'interface g0/0', 'ip address 10.0.0.1 255.255.255.252',
      'no shutdown', 'end',
    ], 'R1'),
    r2: runCommands([
      'enable', 'configure terminal',
      'access-list 10 deny host 10.0.0.1',
      'access-list 10 permit any',
      'interface g0/0', 'ip address 10.0.0.2 255.255.255.252',
      'ip access-group 10 in', 'no shutdown', 'end',
    ], 'R2'),
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices: fixture.devices,
    activeDeviceId: 'r1',
    topology: fixture.topology,
    rawCommand: 'ping 10.0.0.2',
  })

  assert.match(result.output, /Success rate is 0 percent/)
  assert.deepEqual(result.state.successfulPings, [])
})

test('enforces an extended ICMP ACL applied outbound', () => {
  const fixture = directRouterTopology()
  const deviceStates = {
    r1: runCommands([
      'enable', 'configure terminal',
      'ip access-list extended BLOCK-PING',
      'deny icmp host 10.0.0.1 host 10.0.0.2',
      'permit ip any any', 'exit',
      'interface g0/0', 'ip address 10.0.0.1 255.255.255.252',
      'ip access-group BLOCK-PING out', 'no shutdown', 'end',
    ], 'R1'),
    r2: runCommands([
      'enable', 'configure terminal',
      'interface g0/0', 'ip address 10.0.0.2 255.255.255.252',
      'no shutdown', 'end',
    ], 'R2'),
  }

  const blocked = executeTopologyCommand({
    deviceStates,
    devices: fixture.devices,
    activeDeviceId: 'r1',
    topology: fixture.topology,
    rawCommand: 'ping 10.0.0.2',
  })
  assert.match(blocked.output, /Success rate is 0 percent/)

  deviceStates.r1 = runCommands([
    'enable', 'configure terminal',
    'ip access-list extended ALLOW-PING',
    'permit icmp host 10.0.0.1 host 10.0.0.2', 'exit',
    'interface g0/0', 'ip address 10.0.0.1 255.255.255.252',
    'ip access-group ALLOW-PING out', 'no shutdown', 'end',
  ], 'R1')
  const permitted = executeTopologyCommand({
    deviceStates,
    devices: fixture.devices,
    activeDeviceId: 'r1',
    topology: fixture.topology,
    rawCommand: 'ping 10.0.0.2',
  })
  assert.match(permitted.output, /Success rate is 100 percent/)
})

test('applies the ACL implicit deny when no rule matches', () => {
  const fixture = directRouterTopology()
  const deviceStates = {
    r1: runCommands([
      'enable', 'configure terminal',
      'interface g0/0', 'ip address 10.0.0.1 255.255.255.252',
      'no shutdown', 'end',
    ], 'R1'),
    r2: runCommands([
      'enable', 'configure terminal',
      'access-list 10 permit host 192.0.2.10',
      'interface g0/0', 'ip address 10.0.0.2 255.255.255.252',
      'ip access-group 10 in', 'no shutdown', 'end',
    ], 'R2'),
  }

  const result = executeTopologyCommand({
    deviceStates,
    devices: fixture.devices,
    activeDeviceId: 'r1',
    topology: fixture.topology,
    rawCommand: 'ping 10.0.0.2',
  })

  assert.match(result.output, /Success rate is 0 percent/)
})

function natTopologyFixture(natCommands = []) {
  return {
    deviceStates: {
      insidePc: configurePcState(createDeviceState('INSIDE-PC', 'pc'), {
        ipAddress: '192.168.10.10',
        subnetMask: '255.255.255.0',
        defaultGateway: '192.168.10.1',
      }).state,
      edge: runCommands([
        'enable', 'configure terminal',
        'interface g0/0', 'ip address 192.168.10.1 255.255.255.0',
        'ip nat inside', 'no shutdown', 'exit',
        'interface g0/1', 'ip address 203.0.113.1 255.255.255.0',
        'ip nat outside', 'no shutdown', 'exit',
        ...natCommands,
        'end',
      ], 'EDGE'),
      outsidePc: configurePcState(createDeviceState('OUTSIDE-PC', 'pc'), {
        ipAddress: '203.0.113.2',
        subnetMask: '255.255.255.0',
        defaultGateway: '203.0.113.1',
      }).state,
    },
    devices: [
      { id: 'insidePc', type: 'pc', label: 'Inside PC' },
      { id: 'edge', type: 'router', label: 'Edge router' },
      { id: 'outsidePc', type: 'pc', label: 'Outside PC' },
    ],
    topology: {
      links: [
        {
          id: 'inside-edge', fromDeviceId: 'insidePc',
          fromInterface: 'Ethernet0', toDeviceId: 'edge',
          toInterface: 'GigabitEthernet0/0',
        },
        {
          id: 'edge-outside', fromDeviceId: 'edge',
          fromInterface: 'GigabitEthernet0/1', toDeviceId: 'outsidePc',
          toInterface: 'Ethernet0',
        },
      ],
    },
  }
}

test('translates and returns inside traffic through interface PAT', () => {
  const fixture = natTopologyFixture([
    'access-list 10 permit 192.168.10.0 0.0.0.255',
    'ip nat inside source list 10 interface g0/1 overload',
  ])

  const result = executeTopologyCommand({
    ...fixture,
    activeDeviceId: 'insidePc',
    rawCommand: 'ping 203.0.113.2',
  })

  assert.match(result.output, /Success rate is 100 percent/)
  assert.deepEqual(result.state.successfulPings, ['203.0.113.2'])
})

test('blocks inside-to-outside traffic without a matching NAT rule', () => {
  const fixture = natTopologyFixture([
    'access-list 10 permit 192.168.20.0 0.0.0.255',
    'ip nat inside source list 10 interface g0/1 overload',
  ])

  const result = executeTopologyCommand({
    ...fixture,
    activeDeviceId: 'insidePc',
    rawCommand: 'ping 203.0.113.2',
  })

  assert.match(result.output, /Success rate is 0 percent/)
  assert.deepEqual(result.state.successfulPings, [])
})

test('supports bidirectional return handling for a static NAT mapping', () => {
  const fixture = natTopologyFixture([
    'ip nat inside source static 192.168.10.10 203.0.113.10',
  ])

  const result = executeTopologyCommand({
    ...fixture,
    activeDeviceId: 'insidePc',
    rawCommand: 'ping 203.0.113.2',
  })

  assert.match(result.output, /Success rate is 100 percent/)
})

test('allows outside hosts to reach an inside host through its static global address', () => {
  const fixture = natTopologyFixture([
    'ip nat inside source static 192.168.10.10 203.0.113.10',
  ])

  const result = executeTopologyCommand({
    ...fixture,
    activeDeviceId: 'outsidePc',
    rawCommand: 'ping 203.0.113.10',
  })

  assert.match(result.output, /Success rate is 100 percent/)
  assert.deepEqual(result.state.successfulPings, ['203.0.113.10'])
})

test('translates matching inside traffic through a configured NAT pool', () => {
  const fixture = natTopologyFixture([
    'access-list 10 permit 192.168.10.0 0.0.0.255',
    'ip nat pool PUBLIC 203.0.113.10 203.0.113.20 netmask 255.255.255.0',
    'ip nat inside source list 10 pool PUBLIC overload',
  ])

  const result = executeTopologyCommand({
    ...fixture,
    activeDeviceId: 'insidePc',
    rawCommand: 'ping 203.0.113.2',
  })

  assert.match(result.output, /Success rate is 100 percent/)
})

function dhcpTopologyFixture() {
  return {
    deviceStates: {
      pc1: createDeviceState('PC1', 'pc'),
      pc2: createDeviceState('PC2', 'pc'),
      sw1: runCommands([
        'enable', 'configure terminal',
        'interface f0/1', 'no shutdown', 'exit',
        'interface f0/2', 'no shutdown', 'exit',
        'interface f0/24', 'no shutdown', 'end',
      ], 'SW1'),
      r1: runCommands([
        'enable', 'configure terminal',
        'ip dhcp excluded-address 192.168.10.1 192.168.10.9',
        'ip dhcp pool STUDENTS',
        'network 192.168.10.0 255.255.255.0',
        'default-router 192.168.10.1',
        'dns-server 8.8.8.8 1.1.1.1',
        'exit',
        'interface g0/0', 'ip address 192.168.10.1 255.255.255.0',
        'no shutdown', 'end',
      ], 'R1'),
    },
    devices: [
      { id: 'pc1', type: 'pc', label: 'PC1' },
      { id: 'pc2', type: 'pc', label: 'PC2' },
      { id: 'sw1', type: 'switch', label: 'SW1' },
      { id: 'r1', type: 'router', label: 'R1' },
    ],
    topology: {
      links: [
        {
          id: 'pc1-sw1', fromDeviceId: 'pc1',
          fromInterface: 'Ethernet0', toDeviceId: 'sw1',
          toInterface: 'FastEthernet0/1',
        },
        {
          id: 'pc2-sw1', fromDeviceId: 'pc2',
          fromInterface: 'Ethernet0', toDeviceId: 'sw1',
          toInterface: 'FastEthernet0/2',
        },
        {
          id: 'sw1-r1', fromDeviceId: 'sw1',
          fromInterface: 'FastEthernet0/24', toDeviceId: 'r1',
          toInterface: 'GigabitEthernet0/0',
        },
      ],
    },
  }
}

test('assigns PC addressing, gateway, and DNS from a reachable DHCP pool', () => {
  const fixture = dhcpTopologyFixture()
  const result = requestDhcpLease({
    ...fixture,
    clientDeviceId: 'pc1',
  })

  assert.equal(result.accepted, true)
  assert.equal(result.state.interfaces.Ethernet0.ipAddress, '192.168.10.10')
  assert.equal(result.state.interfaces.Ethernet0.subnetMask, '255.255.255.0')
  assert.equal(result.state.defaultGateway, '192.168.10.1')
  assert.deepEqual(result.state.dnsServers, ['8.8.8.8', '1.1.1.1'])
  assert.equal(result.state.dhcpEnabled, true)
  assert.equal(result.state.dhcpPoolName, 'STUDENTS')
  assert.equal(result.state.dhcpServerId, 'r1')
})

test('does not assign the same DHCP lease to two PCs', () => {
  const fixture = dhcpTopologyFixture()
  const first = requestDhcpLease({
    ...fixture,
    clientDeviceId: 'pc1',
  })
  fixture.deviceStates.pc1 = first.state
  const second = requestDhcpLease({
    ...fixture,
    clientDeviceId: 'pc2',
  })

  assert.equal(first.state.interfaces.Ethernet0.ipAddress, '192.168.10.10')
  assert.equal(second.state.interfaces.Ethernet0.ipAddress, '192.168.10.11')
})

test('does not cross a router to discover a remote DHCP pool', () => {
  const fixture = dhcpTopologyFixture()
  fixture.topology.links = fixture.topology.links.filter(
    (link) => link.id !== 'sw1-r1',
  )

  const result = requestDhcpLease({
    ...fixture,
    clientDeviceId: 'pc1',
  })

  assert.equal(result.accepted, false)
  assert.match(result.error, /No reachable DHCP server/i)
})

test('reports an exhausted DHCP pool without changing the PC', () => {
  const fixture = dhcpTopologyFixture()
  fixture.deviceStates.r1.dhcpPools.STUDENTS.network = '192.168.10.0'
  fixture.deviceStates.r1.dhcpPools.STUDENTS.subnetMask = '255.255.255.252'
  fixture.deviceStates.r1.dhcpExcludedRanges = [{
    startIp: '192.168.10.1',
    endIp: '192.168.10.2',
  }]

  const result = requestDhcpLease({
    ...fixture,
    clientDeviceId: 'pc1',
  })

  assert.equal(result.accepted, false)
  assert.match(result.error, /no available addresses/i)
})
