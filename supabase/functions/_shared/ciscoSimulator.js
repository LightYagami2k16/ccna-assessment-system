export function createDeviceState(hostname = 'Switch', deviceType = 'switch') {
  const state = {
    hostname,
    deviceType,
    mode: 'user_exec',
    activeVlan: null,
    activeInterface: null,
    activeLine: null,
    vlans: {},
    interfaces: {},
    enableSecret: '',
    servicePasswordEncryption: false,
    bannerMotd: '',
    domainName: '',
    users: {},
    lines: {},
    ipRouting: false,
    defaultGateway: '',
    dnsServers: [],
    dhcpEnabled: false,
    dhcpServerId: '',
    dhcpPoolName: '',
    staticRoutes: [],
    ospfProcesses: {},
    activeOspfProcess: null,
    accessLists: {},
    activeAccessList: null,
    dhcpPools: {},
    activeDhcpPool: null,
    dhcpExcludedRanges: [],
    natPools: {},
    natRules: [],
    spanningTree: {
      mode: 'pvst',
      vlanPriorities: {},
    },
    rsaKeyBits: 0,
    sshVersion: 1,
    saved: false,
  }

  if (deviceType === 'pc') {
    state.interfaces.Ethernet0 = {
      description: 'PC network adapter',
      switchportMode: '',
      accessVlan: null,
      voiceVlan: null,
      trunkNativeVlan: 1,
      trunkAllowedVlans: null,
      encapsulationDot1q: null,
      encapsulationNative: false,
      ipAddress: '',
      subnetMask: '',
      shutdown: false,
      ipAccessGroups: { in: '', out: '' },
      natRole: '',
      channelGroup: null,
      spanningTreePortfast: false,
    }
  }

  return state
}

function ensureStateShape(state) {
  state.deviceType ??= 'switch'
  state.vlans ??= {}
  state.interfaces ??= {}
  state.enableSecret ??= ''
  state.servicePasswordEncryption ??= false
  state.bannerMotd ??= ''
  state.domainName ??= ''
  state.users ??= {}
  state.lines ??= {}
  state.ipRouting ??= false
  state.defaultGateway ??= ''
  state.dnsServers ??= []
  state.dhcpEnabled ??= false
  state.dhcpServerId ??= ''
  state.dhcpPoolName ??= ''
  state.staticRoutes ??= []
  state.ospfProcesses ??= {}
  Object.keys(state.ospfProcesses).forEach((processId) => {
    ensureOspfProcess(state, processId)
  })
  state.activeOspfProcess ??= null
  state.accessLists ??= {}
  Object.keys(state.accessLists).forEach((accessListId) => {
    ensureAccessList(
      state,
      accessListId,
      state.accessLists[accessListId]?.type ?? 'standard',
      state.accessLists[accessListId]?.named ?? !/^\d+$/.test(accessListId),
    )
  })
  state.activeAccessList ??= null
  state.dhcpPools ??= {}
  Object.keys(state.dhcpPools).forEach((poolName) => {
    ensureDhcpPool(state, poolName)
  })
  state.activeDhcpPool ??= null
  state.dhcpExcludedRanges ??= []
  state.natPools ??= {}
  state.natRules ??= []
  state.spanningTree ??= { mode: 'pvst', vlanPriorities: {} }
  state.spanningTree.mode ??= 'pvst'
  state.spanningTree.vlanPriorities ??= {}
  state.rsaKeyBits ??= 0
  state.sshVersion ??= 1
  state.activeLine ??= null
  state.saved ??= false
  return state
}

export function getDevicePrompt(state) {
  const hostname = state.hostname || 'Switch'
  if (state.deviceType === 'pc') return `${hostname}>`
  if (state.mode === 'acl_config') {
    const accessList = state.accessLists?.[state.activeAccessList]
    return `${hostname}${
      accessList?.type === 'extended'
        ? '(config-ext-nacl)#'
        : '(config-std-nacl)#'
    }`
  }
  if (state.mode === 'dhcp_pool_config') {
    return `${hostname}(dhcp-config)#`
  }
  const suffix = {
    user_exec: '>',
    privileged_exec: '#',
    global_config: '(config)#',
    vlan_config: '(config-vlan)#',
    interface_config: '(config-if)#',
    line_config: '(config-line)#',
    router_config: '(config-router)#',
  }[state.mode]
  return `${hostname}${suffix ?? '>'}`
}

export function executePcCommand(currentState, rawCommand) {
  const state = ensureStateShape(structuredClone(currentState))
  const modeBefore = state.mode ?? 'user_exec'
  const command = String(rawCommand ?? '').trim().replace(/\s+/g, ' ')
  const lower = command.toLowerCase()
  const adapter = state.interfaces.Ethernet0 ?? {
    ipAddress: '',
    subnetMask: '',
    shutdown: false,
  }
  state.interfaces.Ethernet0 = adapter

  const outcome = (accepted, output = '') => ({
    state,
    accepted,
    output,
    modeBefore,
    modeAfter: state.mode ?? 'user_exec',
  })

  if (lower === 'ipconfig' || lower === 'ipconfig /all') {
    return outcome(true, [
      'Ethernet adapter Ethernet0:',
      '',
      `   IPv4 Address. . . . . . . . . . . : ${adapter.ipAddress || '0.0.0.0'}`,
      `   Subnet Mask . . . . . . . . . . . : ${adapter.subnetMask || '0.0.0.0'}`,
      `   Default Gateway . . . . . . . . . : ${state.defaultGateway || ''}`,
      `   DNS Servers . . . . . . . . . . . : ${state.dnsServers[0] || ''}`,
      ...(state.dnsServers[1] ? [`                                         ${state.dnsServers[1]}`] : []),
    ].join('\n'))
  }

  const addressMatch = command.match(/^ipconfig \/ip (\S+) (\S+)$/i)
  if (addressMatch) {
    if (
      ipv4ToNumber(addressMatch[1]) === null
      || prefixLengthFromMask(addressMatch[2]) === null
    ) return outcome(false, 'Invalid IPv4 address or subnet mask.')
    adapter.ipAddress = addressMatch[1]
    adapter.subnetMask = addressMatch[2]
    return outcome(true, 'IPv4 configuration updated.')
  }

  const gatewayMatch = command.match(/^ipconfig \/gateway (\S+)$/i)
  if (gatewayMatch) {
    if (ipv4ToNumber(gatewayMatch[1]) === null) {
      return outcome(false, 'Invalid default gateway address.')
    }
    state.defaultGateway = gatewayMatch[1]
    return outcome(true, 'Default gateway updated.')
  }

  if (lower === 'ipconfig /clear') {
    adapter.ipAddress = ''
    adapter.subnetMask = ''
    state.defaultGateway = ''
    return outcome(true, 'IPv4 configuration cleared.')
  }

  if (lower === 'help' || lower === '?') {
    return outcome(true, [
      'Supported PC commands:',
      '  ipconfig',
      '  ipconfig /all',
      '  ipconfig /ip <address> <subnet-mask>',
      '  ipconfig /gateway <address>',
      '  ipconfig /clear',
      '  ping <address>',
      '  tracert <address>',
      '  ssh <username>@<address>',
    ].join('\n'))
  }

  return outcome(false, `'${command}' is not recognized as a supported command.`)
}

export function configurePcState(currentState, settings) {
  const state = ensureStateShape(structuredClone(currentState))
  const values = {
    ipAddress: String(settings?.ipAddress ?? '').trim(),
    subnetMask: String(settings?.subnetMask ?? '').trim(),
    defaultGateway: String(settings?.defaultGateway ?? '').trim(),
    preferredDns: String(settings?.preferredDns ?? '').trim(),
    alternateDns: String(settings?.alternateDns ?? '').trim(),
  }

  if (ipv4ToNumber(values.ipAddress) === null) {
    return { accepted: false, error: 'Enter a valid IPv4 address.' }
  }
  if (prefixLengthFromMask(values.subnetMask) === null) {
    return { accepted: false, error: 'Enter a valid contiguous subnet mask.' }
  }
  for (const [field, label] of [
    ['defaultGateway', 'default gateway'],
    ['preferredDns', 'preferred DNS server'],
    ['alternateDns', 'alternate DNS server'],
  ]) {
    if (values[field] && ipv4ToNumber(values[field]) === null) {
      return { accepted: false, error: `Enter a valid ${label}.` }
    }
  }
  if (
    values.defaultGateway
    && !addressMatchesNetwork(
      values.defaultGateway,
      networkAddress(values.ipAddress, values.subnetMask),
      values.subnetMask,
    )
  ) {
    return {
      accepted: false,
      error: 'The default gateway must be in the same subnet as the PC.',
    }
  }

  const adapter = state.interfaces.Ethernet0
  adapter.ipAddress = values.ipAddress
  adapter.subnetMask = values.subnetMask
  adapter.shutdown = false
  state.defaultGateway = values.defaultGateway
  state.dnsServers = [values.preferredDns, values.alternateDns].filter(Boolean)
  state.dhcpEnabled = false
  state.dhcpServerId = ''
  state.dhcpPoolName = ''

  return {
    state,
    accepted: true,
    output: 'IPv4 settings applied.',
    modeBefore: state.mode ?? 'user_exec',
    modeAfter: state.mode ?? 'user_exec',
  }
}

function crossDhcpLink({
  currentState,
  currentType,
  outgoingInterface,
  neighborState,
  neighborType,
  neighborInterface,
  trafficVlan,
}) {
  let wireVlan = null
  if (currentType === 'switch') {
    const egress = leaveSwitchPort(
      currentState.interfaces?.[outgoingInterface],
      trafficVlan,
    )
    if (!egress.allowed) return null
    wireVlan = egress.wireVlan
  }

  if (neighborType === 'switch') {
    const ingress = enterSwitchPort(
      neighborState.interfaces?.[neighborInterface],
      wireVlan,
    )
    return ingress.allowed
      ? { trafficVlan: ingress.trafficVlan, wireVlan }
      : null
  }

  return nonSwitchAcceptsWireVlan(
    neighborState,
    neighborInterface,
    wireVlan,
  ) ? { trafficVlan: wireVlan, wireVlan } : null
}

function dhcpReachableDevices({ deviceStates, devices, topology, clientDeviceId }) {
  const adjacency = activeTopologyAdjacency(deviceStates, topology)
  const spanningTreeCache = new Map()
  const deviceTypes = new Map(
    (devices ?? []).map((device) => [device.id, device.type]),
  )
  const reachable = []
  const visited = new Set([`${clientDeviceId}:untagged`])
  const queue = [{ deviceId: clientDeviceId, trafficVlan: null }]

  while (queue.length) {
    const current = queue.shift()
    const currentState = deviceStates[current.deviceId]
    const currentType = deviceTypes.get(current.deviceId) ?? 'router'
    if (!currentState || (current.deviceId !== clientDeviceId
      && currentType !== 'switch')) continue

    for (const edge of adjacency.get(current.deviceId) ?? []) {
      const neighborState = deviceStates[edge.deviceId]
      const neighborType = deviceTypes.get(edge.deviceId) ?? 'router'
      if (!neighborState) continue
      if (!spanningTreeAllowsEdge({
        deviceStates,
        deviceTypes,
        adjacency,
        cache: spanningTreeCache,
        currentDeviceId: current.deviceId,
        edge,
        vlanId: current.trafficVlan,
      })) continue
      const crossing = crossDhcpLink({
        currentState,
        currentType,
        outgoingInterface: edge.outgoingInterface,
        neighborState,
        neighborType,
        neighborInterface: edge.neighborInterface,
        trafficVlan: current.trafficVlan,
      })
      if (!crossing) continue

      reachable.push({
        deviceId: edge.deviceId,
        incomingInterface: edge.neighborInterface,
        wireVlan: crossing.wireVlan,
      })
      if (neighborType !== 'switch') continue
      const visitKey = `${edge.deviceId}:${crossing.trafficVlan ?? 'untagged'}`
      if (visited.has(visitKey)) continue
      visited.add(visitKey)
      queue.push({
        deviceId: edge.deviceId,
        trafficVlan: crossing.trafficVlan,
      })
    }
  }
  return reachable
}

function addressIsExcluded(address, ranges) {
  const addressNumber = ipv4ToNumber(address)
  return (ranges ?? []).some((range) => {
    const start = ipv4ToNumber(range.startIp)
    const end = ipv4ToNumber(range.endIp)
    return start !== null && end !== null
      && addressNumber >= start && addressNumber <= end
  })
}

function nextDhcpAddress(pool, excludedRanges, usedAddresses) {
  const networkNumber = ipv4ToNumber(pool.network)
  const maskNumber = ipv4ToNumber(pool.subnetMask)
  if (networkNumber === null || prefixLengthFromMask(pool.subnetMask) === null) {
    return ''
  }
  const broadcastNumber = (networkNumber | (~maskNumber >>> 0)) >>> 0
  for (let candidate = networkNumber + 1; candidate < broadcastNumber; candidate += 1) {
    const address = numberToIpv4(candidate >>> 0)
    if (!usedAddresses.has(address) && !addressIsExcluded(address, excludedRanges)) {
      return address
    }
  }
  return ''
}

export function requestDhcpLease({
  deviceStates,
  devices,
  topology,
  clientDeviceId,
}) {
  const clientState = deviceStates?.[clientDeviceId]
  if (clientState?.deviceType !== 'pc') {
    return { accepted: false, error: 'DHCP can only configure a PC.' }
  }
  const reachable = dhcpReachableDevices({
    deviceStates,
    devices,
    topology,
    clientDeviceId,
  })
  const server = reachable.flatMap((entry) => {
    const state = deviceStates[entry.deviceId]
    return Object.values(state?.dhcpPools ?? {}).map((pool) => ({
      ...entry,
      state,
      pool,
    }))
  }).find(({ state, pool }) =>
    pool.network
    && pool.subnetMask
    && activeInterfaceAddresses(state).some((address) =>
      addressMatchesNetwork(address, pool.network, pool.subnetMask),
    ),
  )
  if (!server) {
    return {
      accepted: false,
      error: 'No reachable DHCP server has a valid pool for this network.',
    }
  }

  const usedAddresses = new Set(
    Object.entries(deviceStates)
      .filter(([deviceId]) => deviceId !== clientDeviceId)
      .flatMap(([, state]) => activeInterfaceAddresses(state)),
  )
  const currentAddress = clientState.interfaces?.Ethernet0?.ipAddress
  const address = currentAddress
    && addressMatchesNetwork(
      currentAddress,
      server.pool.network,
      server.pool.subnetMask,
    )
    && !addressIsExcluded(currentAddress, server.state.dhcpExcludedRanges)
    ? currentAddress
    : nextDhcpAddress(
      server.pool,
      server.state.dhcpExcludedRanges,
      usedAddresses,
    )
  if (!address) {
    return { accepted: false, error: 'The DHCP pool has no available addresses.' }
  }

  const state = ensureStateShape(structuredClone(clientState))
  state.interfaces.Ethernet0.ipAddress = address
  state.interfaces.Ethernet0.subnetMask = server.pool.subnetMask
  state.interfaces.Ethernet0.shutdown = false
  state.defaultGateway = server.pool.defaultRouters?.[0] ?? ''
  state.dnsServers = [...(server.pool.dnsServers ?? [])]
  state.dhcpEnabled = true
  state.dhcpServerId = server.deviceId
  state.dhcpPoolName = server.pool.name
  return {
    accepted: true,
    state,
    output: `DHCP assigned ${address} from ${server.pool.name}.`,
    modeBefore: state.mode,
    modeAfter: state.mode,
  }
}

export function normalizeInterface(value) {
  const compact = String(value ?? '').replaceAll(' ', '').toLowerCase()
  const patterns = [
    {
      expression: /^(fastethernet|fa|f)(\d+(?:\/\d+){1,2}(?:\.\d+)?)$/,
      prefix: 'FastEthernet',
    },
    {
      expression: /^(gigabitethernet|gi|g)(\d+(?:\/\d+){1,2}(?:\.\d+)?)$/,
      prefix: 'GigabitEthernet',
    },
    {
      expression: /^(tengigabitethernet|te)(\d+(?:\/\d+){1,2}(?:\.\d+)?)$/,
      prefix: 'TenGigabitEthernet',
    },
    {
      expression: /^(ethernet|e)(\d+(?:\/\d+){0,2}(?:\.\d+)?)$/,
      prefix: 'Ethernet',
    },
    {
      expression: /^(port-channel|po)(\d+)$/,
      prefix: 'Port-channel',
    },
    {
      expression: /^(vlan)(\d+)$/,
      prefix: 'Vlan',
    },
    {
      expression: /^(loopback|lo)(\d+)$/,
      prefix: 'Loopback',
    },
    {
      expression: /^(serial|s)(\d+(?:\/\d+){1,2}(?:\.\d+)?)$/,
      prefix: 'Serial',
    },
  ]

  for (const pattern of patterns) {
    const match = compact.match(pattern.expression)
    if (match) return `${pattern.prefix}${match[2]}`
  }
  return null
}

function abbreviateInterface(name) {
  return name
    .replace('FastEthernet', 'Fa')
    .replace('GigabitEthernet', 'Gi')
    .replace('TenGigabitEthernet', 'Te')
    .replace('Port-channel', 'Po')
    .replace('Loopback', 'Lo')
}

function ensureInterface(state, name) {
  state.interfaces[name] ??= {
    description: '',
    switchportMode: '',
    accessVlan: null,
    voiceVlan: null,
    trunkNativeVlan: 1,
    trunkAllowedVlans: null,
    encapsulationDot1q: null,
    encapsulationNative: false,
    ipAddress: '',
    subnetMask: '',
    shutdown: !name.includes('.'),
    ipAccessGroups: {
      in: '',
      out: '',
    },
    natRole: '',
    channelGroup: null,
    spanningTreePortfast: false,
    spanningTreeBpduguard: false,
  }
  const item = state.interfaces[name]
  item.description ??= ''
  item.switchportMode ??= ''
  item.accessVlan ??= null
  item.voiceVlan ??= null
  item.trunkNativeVlan ??= 1
  item.trunkAllowedVlans ??= null
  item.encapsulationDot1q ??= null
  item.encapsulationNative ??= false
  item.ipAddress ??= ''
  item.subnetMask ??= ''
  item.shutdown ??= true
  item.ipAccessGroups ??= { in: '', out: '' }
  item.ipAccessGroups.in ??= ''
  item.ipAccessGroups.out ??= ''
  item.natRole ??= ''
  item.channelGroup ??= null
  item.spanningTreePortfast ??= false
  item.spanningTreeBpduguard ??= false
  return item
}

function ensureLine(state, name) {
  state.lines[name] ??= {
    password: '',
    login: false,
    loginLocal: false,
    transportInput: '',
  }
  const line = state.lines[name]
  line.password ??= ''
  line.login ??= false
  line.loginLocal ??= false
  line.transportInput ??= ''
  return line
}

function ensureOspfProcess(state, processId) {
  state.ospfProcesses[processId] ??= {
    routerId: '',
    networks: [],
    passiveDefault: false,
    passiveInterfaces: [],
    nonPassiveInterfaces: [],
    defaultInformationOriginate: false,
  }
  const process = state.ospfProcesses[processId]
  process.routerId ??= ''
  process.networks ??= []
  process.passiveDefault ??= false
  process.passiveInterfaces ??= []
  process.nonPassiveInterfaces ??= []
  process.defaultInformationOriginate ??= false
  return process
}

function canonicalDhcpPoolName(value) {
  return String(value ?? '').trim().toUpperCase()
}

function ensureDhcpPool(state, name) {
  const canonicalName = canonicalDhcpPoolName(name)
  state.dhcpPools[canonicalName] ??= {
    name: canonicalName,
    network: '',
    subnetMask: '',
    defaultRouters: [],
    dnsServers: [],
    domainName: '',
    lease: '',
  }
  const pool = state.dhcpPools[canonicalName]
  pool.name ??= canonicalName
  pool.network ??= ''
  pool.subnetMask ??= ''
  pool.defaultRouters ??= []
  pool.dnsServers ??= []
  pool.domainName ??= ''
  pool.lease ??= ''
  return pool
}

function canonicalAccessListId(value) {
  const normalized = String(value ?? '').trim()
  return /^\d+$/.test(normalized) ? normalized : normalized.toUpperCase()
}

function accessListTypeForNumber(value) {
  const number = Number(value)
  if (
    (number >= 1 && number <= 99)
    || (number >= 1300 && number <= 1999)
  ) return 'standard'
  if (
    (number >= 100 && number <= 199)
    || (number >= 2000 && number <= 2699)
  ) return 'extended'
  return null
}

function ensureAccessList(state, id, type, named = true) {
  const canonicalId = canonicalAccessListId(id)
  state.accessLists[canonicalId] ??= {
    type,
    named,
    entries: [],
  }
  const accessList = state.accessLists[canonicalId]
  accessList.type ??= type
  accessList.named ??= named
  accessList.entries ??= []
  return accessList
}

function consumeAclAddress(tokens, startIndex) {
  const token = tokens[startIndex]
  if (token === 'any') {
    return { value: 'any', nextIndex: startIndex + 1 }
  }
  if (
    token === 'host'
    && ipv4ToNumber(tokens[startIndex + 1]) !== null
  ) {
    return {
      value: `host ${tokens[startIndex + 1]}`,
      nextIndex: startIndex + 2,
    }
  }
  if (
    ipv4ToNumber(token) !== null
    && ipv4ToNumber(tokens[startIndex + 1]) !== null
  ) {
    return {
      value: `${token} ${tokens[startIndex + 1]}`,
      nextIndex: startIndex + 2,
    }
  }
  return null
}

function consumeAclPort(tokens, startIndex) {
  const operator = tokens[startIndex]
  if (!['eq', 'neq', 'lt', 'gt', 'range'].includes(operator)) {
    return { value: '', nextIndex: startIndex }
  }

  const requiredValues = operator === 'range' ? 2 : 1
  const values = tokens.slice(startIndex + 1, startIndex + 1 + requiredValues)
  if (
    values.length !== requiredValues
    || values.some((value) => !/^[a-z0-9-]+$/.test(value))
  ) return null

  return {
    value: `${operator} ${values.join(' ')}`,
    nextIndex: startIndex + 1 + requiredValues,
  }
}

function normalizeAclStatement(value, type) {
  const tokens = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
  const action = tokens[0]
  if (!['permit', 'deny'].includes(action)) return null

  if (type === 'standard') {
    const source = consumeAclAddress(tokens, 1)
    if (!source) return null
    const remaining = tokens.slice(source.nextIndex)
    if (remaining.length > 1 || (remaining[0] && remaining[0] !== 'log')) {
      return null
    }
    return `${action} ${source.value}${remaining[0] ? ' log' : ''}`
  }

  const protocol = tokens[1]
  if (!protocol || !/^[a-z0-9-]+$/.test(protocol)) return null
  const source = consumeAclAddress(tokens, 2)
  if (!source) return null
  const sourcePort = consumeAclPort(tokens, source.nextIndex)
  if (!sourcePort) return null
  const destination = consumeAclAddress(tokens, sourcePort.nextIndex)
  if (!destination) return null
  const destinationPort = consumeAclPort(tokens, destination.nextIndex)
  if (!destinationPort) return null
  const remaining = tokens.slice(destinationPort.nextIndex)
  if (
    remaining.length > 1
    || (remaining[0] && !['log', 'established'].includes(remaining[0]))
  ) return null

  return [
    action,
    protocol,
    source.value,
    sourcePort.value,
    destination.value,
    destinationPort.value,
    remaining[0] ?? '',
  ].filter(Boolean).join(' ')
}

function addAccessListEntry(accessList, statement, sequence = null) {
  const nextSequence = sequence ?? (
    accessList.entries.reduce(
      (maximum, entry) => Math.max(maximum, Number(entry.sequence) || 0),
      0,
    ) + 10
  )
  accessList.entries = accessList.entries.filter(
    (entry) => Number(entry.sequence) !== Number(nextSequence),
  )
  accessList.entries.push({
    sequence: Number(nextSequence),
    statement,
  })
  accessList.entries.sort(
    (left, right) => Number(left.sequence) - Number(right.sequence),
  )
}

function normalizeLine(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (normalized === 'console 0' || normalized === 'con 0') return 'console'
  if (/^(vty|v) \d+( \d+)?$/.test(normalized)) return 'vty'
  return null
}

export function parseVlanList(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'all') return null
  if (normalized === 'none') return []

  const vlans = new Set()
  for (const part of normalized.split(',')) {
    const token = part.trim()
    if (/^\d+$/.test(token)) {
      const id = Number(token)
      if (id < 1 || id > 4094) return undefined
      vlans.add(id)
      continue
    }

    const range = token.match(/^(\d+)-(\d+)$/)
    if (!range) return undefined
    const start = Number(range[1])
    const end = Number(range[2])
    if (start < 1 || end > 4094 || start > end) return undefined
    for (let id = start; id <= end; id += 1) vlans.add(id)
  }

  return [...vlans].sort((left, right) => left - right)
}

function ipv4ToNumber(value) {
  const octets = String(value ?? '').split('.')
  if (
    octets.length !== 4
    || octets.some((octet) => !/^\d+$/.test(octet) || Number(octet) > 255)
  ) {
    return null
  }
  return octets.reduce(
    (result, octet) => ((result << 8) | Number(octet)) >>> 0,
    0,
  )
}

function numberToIpv4(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.')
}

function prefixLengthFromMask(mask) {
  const numericMask = ipv4ToNumber(mask)
  if (numericMask === null) return null
  const inverted = (~numericMask) >>> 0
  if ((inverted & ((inverted + 1) >>> 0)) !== 0) return null
  return numericMask.toString(2).replaceAll('0', '').length
}

function networkAddress(address, mask) {
  const numericAddress = ipv4ToNumber(address)
  const numericMask = ipv4ToNumber(mask)
  if (numericAddress === null || prefixLengthFromMask(mask) === null) return null
  return numberToIpv4((numericAddress & numericMask) >>> 0)
}

function normalizeRouteNextHop(value) {
  if (ipv4ToNumber(value) !== null) return value
  return normalizeInterface(value)
}

function canonicalNatPoolName(value) {
  return String(value ?? '').trim().toUpperCase()
}

function canonicalNatRule(rule) {
  if (rule.type === 'static') {
    return `static:${rule.localIp}:${rule.globalIp}`
  }
  return [
    'dynamic',
    canonicalAccessListId(rule.aclId),
    rule.sourceType,
    rule.sourceType === 'interface'
      ? normalizeInterface(rule.source) ?? rule.source
      : canonicalNatPoolName(rule.source),
    rule.overload ? 'overload' : '',
  ].join(':')
}

function runningConfig(state) {
  const lines = [`hostname ${state.hostname}`]
  if (state.enableSecret) lines.push(`enable secret ${state.enableSecret}`)
  if (state.servicePasswordEncryption) lines.push('service password-encryption')
  if (state.bannerMotd) lines.push(`banner motd #${state.bannerMotd}#`)
  if (state.domainName) lines.push(`ip domain-name ${state.domainName}`)
  if (state.rsaKeyBits) {
    lines.push(`crypto key generate rsa modulus ${state.rsaKeyBits}`)
  }
  if (state.sshVersion !== 1) lines.push(`ip ssh version ${state.sshVersion}`)
  if (state.ipRouting) lines.push('ip routing')
  if (state.defaultGateway) lines.push(`ip default-gateway ${state.defaultGateway}`)
  Object.entries(state.users).forEach(([username, user]) => {
    const credentialType = user.credentialType === 'password'
      ? 'password'
      : 'secret'
    const privilege = Number.isInteger(user.privilege)
      ? ` privilege ${user.privilege}`
      : ''
    lines.push(
      `username ${username}${privilege} ${credentialType} ${user.secret}`,
    )
  })
  Object.entries(state.vlans).forEach(([id, vlan]) => {
    lines.push('!', `vlan ${id}`)
    if (vlan.name) lines.push(` name ${vlan.name}`)
  })
  Object.entries(state.interfaces).forEach(([name, item]) => {
    lines.push('!', `interface ${name}`)
    if (item.description) lines.push(` description ${item.description}`)
    if (item.encapsulationDot1q) {
      lines.push(
        ` encapsulation dot1Q ${item.encapsulationDot1q}${
          item.encapsulationNative ? ' native' : ''
        }`,
      )
    }
    if (item.switchportMode) lines.push(` switchport mode ${item.switchportMode}`)
    if (item.accessVlan) lines.push(` switchport access vlan ${item.accessVlan}`)
    if (item.voiceVlan) lines.push(` switchport voice vlan ${item.voiceVlan}`)
    if (item.switchportMode === 'trunk') {
      if (item.trunkNativeVlan !== 1) {
        lines.push(` switchport trunk native vlan ${item.trunkNativeVlan}`)
      }
      if (item.trunkAllowedVlans !== null) {
        lines.push(
          ` switchport trunk allowed vlan ${
            item.trunkAllowedVlans.length ? item.trunkAllowedVlans.join(',') : 'none'
          }`,
        )
      }
    }
    if (item.ipAddress) lines.push(` ip address ${item.ipAddress} ${item.subnetMask}`)
    if (item.ipAccessGroups.in) {
      lines.push(` ip access-group ${item.ipAccessGroups.in} in`)
    }
    if (item.ipAccessGroups.out) {
      lines.push(` ip access-group ${item.ipAccessGroups.out} out`)
    }
    if (item.natRole) lines.push(` ip nat ${item.natRole}`)
    if (item.channelGroup) {
      lines.push(
        ` channel-group ${item.channelGroup.id} mode ${item.channelGroup.mode}`,
      )
    }
    if (item.spanningTreePortfast) lines.push(' spanning-tree portfast')
    if (item.spanningTreeBpduguard) {
      lines.push(' spanning-tree bpduguard enable')
    }
    lines.push(item.shutdown ? ' shutdown' : ' no shutdown')
  })
  state.staticRoutes.forEach((route) => {
    lines.push(
      `ip route ${route.network} ${route.mask} ${route.nextHop}${
        route.administrativeDistance !== 1
          ? ` ${route.administrativeDistance}`
          : ''
      }`,
    )
  })
  Object.entries(state.ospfProcesses).forEach(([processId, process]) => {
    lines.push('!', `router ospf ${processId}`)
    if (process.routerId) lines.push(` router-id ${process.routerId}`)
    process.networks.forEach((network) => {
      lines.push(
        ` network ${network.network} ${network.wildcard} area ${network.area}`,
      )
    })
    if (process.passiveDefault) lines.push(' passive-interface default')
    process.passiveInterfaces.forEach((interfaceName) => {
      lines.push(` passive-interface ${interfaceName}`)
    })
    process.nonPassiveInterfaces.forEach((interfaceName) => {
      lines.push(` no passive-interface ${interfaceName}`)
    })
    if (process.defaultInformationOriginate) {
      lines.push(' default-information originate')
    }
  })
  Object.entries(state.accessLists).forEach(([id, accessList]) => {
    if (accessList.named) {
      lines.push('!', `ip access-list ${accessList.type} ${id}`)
      accessList.entries.forEach((entry) => {
        lines.push(` ${entry.sequence} ${entry.statement}`)
      })
      return
    }
    accessList.entries.forEach((entry) => {
      lines.push(`access-list ${id} ${entry.statement}`)
    })
  })
  Object.values(state.natPools).forEach((pool) => {
    lines.push(
      `ip nat pool ${pool.name} ${pool.startIp} ${pool.endIp} netmask ${pool.netmask}`,
    )
  })
  state.natRules.forEach((rule) => {
    if (rule.type === 'static') {
      lines.push(`ip nat inside source static ${rule.localIp} ${rule.globalIp}`)
      return
    }
    lines.push(
      `ip nat inside source list ${rule.aclId} ${rule.sourceType} ${
        rule.source
      }${rule.overload ? ' overload' : ''}`,
    )
  })
  state.dhcpExcludedRanges.forEach((range) => {
    lines.push(
      `ip dhcp excluded-address ${range.startIp}${
        range.endIp !== range.startIp ? ` ${range.endIp}` : ''
      }`,
    )
  })
  Object.values(state.dhcpPools).forEach((pool) => {
    lines.push('!', `ip dhcp pool ${pool.name}`)
    if (pool.network) lines.push(` network ${pool.network} ${pool.subnetMask}`)
    if (pool.defaultRouters.length) {
      lines.push(` default-router ${pool.defaultRouters.join(' ')}`)
    }
    if (pool.dnsServers.length) {
      lines.push(` dns-server ${pool.dnsServers.join(' ')}`)
    }
    if (pool.domainName) lines.push(` domain-name ${pool.domainName}`)
    if (pool.lease) lines.push(` lease ${pool.lease}`)
  })
  if (state.spanningTree.mode !== 'pvst') {
    lines.push(`spanning-tree mode ${state.spanningTree.mode}`)
  }
  Object.entries(state.spanningTree.vlanPriorities).forEach(
    ([vlanId, priority]) => {
      lines.push(`spanning-tree vlan ${vlanId} priority ${priority}`)
    },
  )
  Object.entries(state.lines).forEach(([name, line]) => {
    lines.push('!', `line ${name === 'console' ? 'console 0' : 'vty 0 4'}`)
    if (line.password) lines.push(` password ${line.password}`)
    if (line.login) lines.push(' login')
    if (line.loginLocal) lines.push(' login local')
    if (line.transportInput) lines.push(` transport input ${line.transportInput}`)
  })
  return lines.join('\n')
}

function vlanBrief(state) {
  const rows = Object.entries(state.vlans)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([id, vlan]) => {
      const ports = Object.entries(state.interfaces)
        .filter(([, item]) => String(item.accessVlan) === id)
        .map(([name]) => abbreviateInterface(name))
        .join(', ')
      return `${id.padEnd(5)}${(vlan.name || `VLAN${id}`).padEnd(33)}active    ${ports}`
    })
  return [
    'VLAN Name                             Status    Ports',
    '---- -------------------------------- --------- -------------------------------',
    ...rows,
  ].join('\n')
}

function interfacesTrunk(state) {
  const trunks = Object.entries(state.interfaces)
    .filter(([, item]) => item.switchportMode === 'trunk')
  if (!trunks.length) return 'No trunk interfaces are currently configured.'

  return [
    'Port        Mode         Encapsulation  Status        Native vlan',
    ...trunks.map(([name, item]) =>
      `${abbreviateInterface(name).padEnd(12)}on           802.1q         trunking      ${
        String(item.trunkNativeVlan ?? 1)
      }`),
    '',
    'Port        Vlans allowed on trunk',
    ...trunks.map(([name, item]) =>
      `${abbreviateInterface(name).padEnd(12)}${
        item.trunkAllowedVlans === null
          ? '1-4094'
          : item.trunkAllowedVlans.join(',') || 'none'
      }`),
  ].join('\n')
}

function interfaceSwitchport(state, name) {
  const item = state.interfaces[name]
  if (!item) return '% Invalid interface type and number'
  return [
    `Name: ${name}`,
    `Switchport: ${item.switchportMode ? 'Enabled' : 'Not configured'}`,
    `Administrative Mode: ${item.switchportMode || 'dynamic auto'}`,
    `Access Mode VLAN: ${item.accessVlan ?? 1}`,
    `Trunking Native Mode VLAN: ${item.trunkNativeVlan ?? 1}`,
    `Trunking VLANs Enabled: ${
      item.trunkAllowedVlans === null
        ? 'ALL'
        : item.trunkAllowedVlans.join(',') || 'NONE'
    }`,
  ].join('\n')
}

function ipRouteTable(state) {
  const connectedRoutes = Object.entries(state.interfaces)
    .filter(([, item]) => item.ipAddress && !item.shutdown)
    .map(([name, item]) => ({
      network: networkAddress(item.ipAddress, item.subnetMask),
      prefixLength: prefixLengthFromMask(item.subnetMask),
      name,
      address: item.ipAddress,
    }))
    .filter((route) => route.network !== null && route.prefixLength !== null)

  const lines = [
    'Codes: C - connected, L - local, S - static, O - OSPF',
    '',
  ]

  connectedRoutes.forEach((route) => {
    lines.push(
      `C    ${route.network}/${route.prefixLength} is directly connected, ${
        abbreviateInterface(route.name)
      }`,
      `L    ${route.address}/32 is directly connected, ${
        abbreviateInterface(route.name)
      }`,
    )
  })

  state.staticRoutes.forEach((route) => {
    const prefixLength = prefixLengthFromMask(route.mask)
    const code = route.network === '0.0.0.0' && route.mask === '0.0.0.0'
      ? 'S*'
      : 'S '
    const via = ipv4ToNumber(route.nextHop) !== null
      ? `via ${route.nextHop}`
      : `is directly connected, ${abbreviateInterface(route.nextHop)}`
    lines.push(
      `${code}   ${route.network}/${prefixLength} [${
        route.administrativeDistance
      }/0] ${via}`,
    )
  })

  if (!connectedRoutes.length && !state.staticRoutes.length) {
    lines.push('Gateway of last resort is not set')
  } else {
    const defaultRoute = state.staticRoutes.find(
      (route) => route.network === '0.0.0.0' && route.mask === '0.0.0.0',
    )
    lines.unshift(
      defaultRoute
        ? `Gateway of last resort is ${defaultRoute.nextHop} to network 0.0.0.0`
        : 'Gateway of last resort is not set',
      '',
    )
  }

  return lines.join('\n')
}

function ospfSummary(state) {
  const processes = Object.entries(state.ospfProcesses)
  if (!processes.length) return 'OSPF is not configured.'

  return processes.map(([processId, process]) => [
    `Routing Process "ospf ${processId}" with ID ${
      process.routerId || '0.0.0.0'
    }`,
    ` Supports only single TOS(TOS0) routes`,
    ` Number of areas in this router is ${
      new Set(process.networks.map((network) => network.area)).size
    }`,
    ` Networks configured: ${process.networks.length}`,
  ].join('\n')).join('\n\n')
}

function ipProtocols(state) {
  const processes = Object.entries(state.ospfProcesses)
  if (!processes.length) return 'Routing Protocol is not configured'

  return processes.map(([processId, process]) => [
    `Routing Protocol is "ospf ${processId}"`,
    `  Router ID ${process.routerId || '0.0.0.0'}`,
    '  Routing for Networks:',
    ...process.networks.map((network) =>
      `    ${network.network} ${network.wildcard} area ${network.area}`),
    `  Passive Interface(s): ${
      process.passiveDefault
        ? 'All interfaces by default'
        : process.passiveInterfaces.join(', ') || 'None'
    }`,
    `  Default information originate: ${
      process.defaultInformationOriginate ? 'enabled' : 'disabled'
    }`,
  ].join('\n')).join('\n\n')
}

function ospfNetworkMatches(address, statementNetwork, wildcard) {
  const numericAddress = ipv4ToNumber(address)
  const numericNetwork = ipv4ToNumber(statementNetwork)
  const numericWildcard = ipv4ToNumber(wildcard)
  if (
    numericAddress === null
    || numericNetwork === null
    || numericWildcard === null
  ) {
    return false
  }

  const mask = (~numericWildcard) >>> 0
  return (numericAddress & mask) === (numericNetwork & mask)
}

function ospfInterfaceBrief(state) {
  const rows = []

  Object.entries(state.ospfProcesses).forEach(([processId, process]) => {
    process.networks.forEach((network) => {
      Object.entries(state.interfaces)
        .filter(([, item]) =>
          item.ipAddress
          && !item.shutdown
          && ospfNetworkMatches(
            item.ipAddress,
            network.network,
            network.wildcard,
          ))
        .forEach(([interfaceName, item]) => {
          const rowKey = `${processId}:${interfaceName}:${network.area}`
          if (rows.some((row) => row.key === rowKey)) return
          rows.push({
            key: rowKey,
            processId,
            area: network.area,
            address: item.ipAddress,
            interfaceName,
          })
        })
    })
  })

  if (!rows.length) {
    return 'No OSPF-enabled interfaces are currently active.'
  }

  return [
    'Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C',
    ...rows.map((row) =>
      `${abbreviateInterface(row.interfaceName).padEnd(13)}${
        String(row.processId).padEnd(6)
      }${String(row.area).padEnd(16)}${row.address.padEnd(19)}1     DR    0/0`),
  ].join('\n')
}

function accessListsOutput(state, requestedId = '') {
  const canonicalRequestedId = requestedId
    ? canonicalAccessListId(requestedId)
    : ''
  const accessLists = Object.entries(state.accessLists)
    .filter(([id]) => !canonicalRequestedId || id === canonicalRequestedId)

  if (!accessLists.length) {
    return requestedId
      ? `% Access list ${requestedId} not found`
      : 'No access lists are configured.'
  }

  return accessLists.map(([id, accessList]) => [
    `${accessList.type === 'extended' ? 'Extended' : 'Standard'} IP access list ${id}`,
    ...accessList.entries.map(
      (entry) => `    ${entry.sequence} ${entry.statement}`,
    ),
  ].join('\n')).join('\n')
}

function natTranslationsOutput(state) {
  const staticRules = state.natRules.filter((rule) => rule.type === 'static')
  if (!staticRules.length) return 'No NAT translations are currently active.'

  return [
    'Pro  Inside global       Inside local        Outside local       Outside global',
    ...staticRules.map((rule) =>
      `---  ${rule.globalIp.padEnd(20)}${rule.localIp.padEnd(20)}---                 ---`),
  ].join('\n')
}

function natStatisticsOutput(state) {
  const insideInterfaces = Object.entries(state.interfaces)
    .filter(([, item]) => item.natRole === 'inside')
    .map(([name]) => abbreviateInterface(name))
  const outsideInterfaces = Object.entries(state.interfaces)
    .filter(([, item]) => item.natRole === 'outside')
    .map(([name]) => abbreviateInterface(name))
  const staticCount = state.natRules.filter((rule) => rule.type === 'static').length
  const dynamicCount = state.natRules.length - staticCount

  return [
    `Total active translations: ${staticCount} (0 static, 0 dynamic; ${staticCount} extended)`,
    `Outside interfaces: ${outsideInterfaces.join(', ') || 'None'}`,
    `Inside interfaces: ${insideInterfaces.join(', ') || 'None'}`,
    `Static mappings configured: ${staticCount}`,
    `Dynamic mappings configured: ${dynamicCount}`,
    `NAT pools configured: ${Object.keys(state.natPools).length}`,
  ].join('\n')
}

function dhcpPoolOutput(state) {
  const pools = Object.values(state.dhcpPools)
  if (!pools.length) return 'No DHCP pools are configured.'
  return pools.map((pool) => [
    `Pool ${pool.name} :`,
    ` Utilization mark (high/low)    : 100 / 0`,
    ` Subnet size (first/next)       : 0 / 0`,
    ` Total addresses                : ${
      pool.network ? 'calculated from configured network' : '0'
    }`,
    ` Leased addresses               : 0`,
    ` Pending event                  : none`,
    ` Network                        : ${
      pool.network
        ? `${pool.network} / ${pool.subnetMask}`
        : 'not configured'
    }`,
    ` Default router                 : ${
      pool.defaultRouters.join(', ') || 'not configured'
    }`,
    ` DNS server                     : ${
      pool.dnsServers.join(', ') || 'not configured'
    }`,
  ].join('\n')).join('\n\n')
}

function etherchannelSummaryOutput(state) {
  const groups = new Map()
  Object.entries(state.interfaces).forEach(([name, item]) => {
    if (!item.channelGroup) return
    const key = String(item.channelGroup.id)
    if (!groups.has(key)) {
      groups.set(key, {
        protocol: ['active', 'passive'].includes(item.channelGroup.mode)
          ? 'LACP'
          : ['desirable', 'auto'].includes(item.channelGroup.mode)
            ? 'PAgP'
            : '-',
        ports: [],
      })
    }
    groups.get(key).ports.push(`${abbreviateInterface(name)}(P)`)
  })
  if (!groups.size) return 'No EtherChannel groups are configured.'
  return [
    'Group  Port-channel  Protocol    Ports',
    '------+-------------+-----------+--------------------------------',
    ...[...groups.entries()].map(([id, group]) =>
      `${id.padEnd(7)}Po${id}(SU)      ${group.protocol.padEnd(12)}${
        group.ports.join(' ')
      }`),
  ].join('\n')
}

function spanningTreeOutput(state, requestedVlan = '') {
  const vlanIds = requestedVlan
    ? [requestedVlan]
    : [...new Set([
      ...Object.keys(state.vlans),
      ...Object.keys(state.spanningTree.vlanPriorities),
      '1',
    ])].sort((left, right) => Number(left) - Number(right))
  return vlanIds.map((vlanId) => {
    const priority = state.spanningTree.vlanPriorities[vlanId] ?? 32768
    const ports = Object.entries(state.interfaces)
      .filter(([, item]) => !item.shutdown)
      .map(([name, item]) =>
        `${abbreviateInterface(name).padEnd(10)}Desg FWD 19        128.1    ${
          item.spanningTreePortfast ? 'P2p Edge' : 'P2p'
        }`)
    return [
      `VLAN${String(vlanId).padStart(4, '0')}`,
      `  Spanning tree enabled protocol ${
        state.spanningTree.mode === 'rapid-pvst' ? 'rstp' : 'ieee'
      }`,
      `  Root ID    Priority    ${priority + Number(vlanId)}`,
      `  Bridge ID  Priority    ${priority + Number(vlanId)}`,
      '',
      'Interface Role Sts Cost      Prio.Nbr Type',
      '--------- ---- --- --------- -------- --------------------------------',
      ...(ports.length ? ports : ['No active interfaces']),
    ].join('\n')
  }).join('\n\n')
}

function sshStatusOutput(state) {
  if (!state.rsaKeyBits) return 'SSH Disabled - version 1.99'
  return [
    `SSH Enabled - version ${state.sshVersion}`,
    `Authentication timeout: 120 secs; Authentication retries: 3`,
    `Minimum expected Diffie Hellman key size : ${state.rsaKeyBits} bits`,
  ].join('\n')
}

function applyAllowedVlanCommand(item, lower) {
  const match = lower.match(
    /^switchport trunk allowed vlan(?: (add|remove))? (.+)$/,
  )
  if (!match) return false
  const operation = match[1] ?? 'replace'
  const parsed = parseVlanList(match[2])
  if (parsed === undefined) return false

  if (operation === 'replace') {
    item.trunkAllowedVlans = parsed
    return true
  }

  const current = item.trunkAllowedVlans === null
    ? Array.from({ length: 4094 }, (_, index) => index + 1)
    : item.trunkAllowedVlans
  const values = parsed === null
    ? Array.from({ length: 4094 }, (_, index) => index + 1)
    : parsed
  const result = new Set(current)
  values.forEach((id) => {
    if (operation === 'add') result.add(id)
    else result.delete(id)
  })
  item.trunkAllowedVlans = [...result].sort((left, right) => left - right)
  return true
}

export function executeCiscoCommand(currentState, rawCommand) {
  const state = ensureStateShape(structuredClone(currentState))
  const modeBefore = state.mode
  const entered = rawCommand.trim()
  const command = entered.replace(/\s+/g, ' ')
  const lower = command.toLowerCase()
  let accepted = true
  let output = ''
  let configurationChanged = false

  if (!command) {
    return { state, accepted: true, output: '', modeBefore, modeAfter: state.mode }
  }

  if (lower === 'enable' && state.mode === 'user_exec') {
    state.mode = 'privileged_exec'
  } else if (lower === 'disable' && state.mode === 'privileged_exec') {
    state.mode = 'user_exec'
  } else if (
    ['configure terminal', 'conf t', 'config t'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    state.mode = 'global_config'
    output = 'Enter configuration commands, one per line.'
  } else if (
    lower === 'end'
    && [
      'global_config',
      'vlan_config',
      'interface_config',
      'line_config',
      'router_config',
      'acl_config',
      'dhcp_pool_config',
    ].includes(state.mode)
  ) {
    state.mode = 'privileged_exec'
    state.activeVlan = null
    state.activeInterface = null
    state.activeLine = null
    state.activeOspfProcess = null
    state.activeAccessList = null
    state.activeDhcpPool = null
  } else if (lower === 'exit') {
    if (
      [
        'vlan_config',
        'interface_config',
        'line_config',
        'router_config',
        'acl_config',
        'dhcp_pool_config',
      ]
        .includes(state.mode)
    ) {
      state.mode = 'global_config'
      state.activeVlan = null
      state.activeInterface = null
      state.activeLine = null
      state.activeOspfProcess = null
      state.activeAccessList = null
      state.activeDhcpPool = null
    } else if (state.mode === 'global_config') {
      state.mode = 'privileged_exec'
    } else {
      accepted = false
    }
  } else if (lower.startsWith('hostname ') && state.mode === 'global_config') {
    const hostname = command.slice(9).trim()
    if (/^[a-z0-9][a-z0-9-]{0,62}$/i.test(hostname)) {
      state.hostname = hostname
      configurationChanged = true
    } else accepted = false
  } else if (lower.startsWith('enable secret ') && state.mode === 'global_config') {
    state.enableSecret = command.slice(14).trim()
    configurationChanged = true
  } else if (lower === 'no enable secret' && state.mode === 'global_config') {
    state.enableSecret = ''
    configurationChanged = true
  } else if (lower === 'service password-encryption' && state.mode === 'global_config') {
    state.servicePasswordEncryption = true
    configurationChanged = true
  } else if (lower === 'no service password-encryption' && state.mode === 'global_config') {
    state.servicePasswordEncryption = false
    configurationChanged = true
  } else if (lower.startsWith('banner motd ') && state.mode === 'global_config') {
    const value = command.slice(12)
    const delimiter = value[0]
    if (delimiter && value.at(-1) === delimiter && value.length > 2) {
      state.bannerMotd = value.slice(1, -1)
      configurationChanged = true
    } else accepted = false
  } else if (lower === 'no banner motd' && state.mode === 'global_config') {
    state.bannerMotd = ''
    configurationChanged = true
  } else if (lower.startsWith('ip domain-name ') && state.mode === 'global_config') {
    state.domainName = command.slice(15).trim()
    configurationChanged = true
  } else if (lower === 'no ip domain-name' && state.mode === 'global_config') {
    state.domainName = ''
    configurationChanged = true
  } else if (
    /^crypto key generate rsa( general-keys)?$/.test(lower)
    && state.mode === 'global_config'
  ) {
    // IOS normally asks for the modulus interactively. Use a secure default
    // here so the common one-line classroom command remains usable.
    state.rsaKeyBits = 2048
    configurationChanged = true
    output = '% Generating 2048 bit RSA keys, keys will be non-exportable... [OK]'
  } else if (
    /^crypto key generate rsa( general-keys)? modulus \d+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const bits = Number(lower.split(' ').at(-1))
    if (bits >= 512 && bits <= 4096) {
      state.rsaKeyBits = bits
      configurationChanged = true
      output = `% Generating ${bits} bit RSA keys, keys will be non-exportable... [OK]`
    } else accepted = false
  } else if (
    ['crypto key zeroize rsa', 'no crypto key generate rsa'].includes(lower)
    && state.mode === 'global_config'
  ) {
    state.rsaKeyBits = 0
    configurationChanged = true
  } else if (
    /^ip ssh version [12]$/.test(lower)
    && state.mode === 'global_config'
  ) {
    state.sshVersion = Number(lower.split(' ').at(-1))
    configurationChanged = true
  } else if (
    lower === 'no ip ssh version'
    && state.mode === 'global_config'
  ) {
    state.sshVersion = 1
    configurationChanged = true
  } else if (lower === 'ip routing' && state.mode === 'global_config') {
    state.ipRouting = true
    configurationChanged = true
  } else if (lower === 'no ip routing' && state.mode === 'global_config') {
    state.ipRouting = false
    configurationChanged = true
  } else if (
    /^ip default-gateway \S+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const gateway = command.split(' ')[2]
    if (ipv4ToNumber(gateway) !== null) {
      state.defaultGateway = gateway
      configurationChanged = true
    } else accepted = false
  } else if (
    lower === 'no ip default-gateway'
    && state.mode === 'global_config'
  ) {
    state.defaultGateway = ''
    configurationChanged = true
  } else if (
    /^ip route \S+ \S+ \S+( \d+)?$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const [, , destination, mask, enteredNextHop, enteredDistance] =
      command.split(' ')
    const normalizedNetwork = networkAddress(destination, mask)
    const nextHop = normalizeRouteNextHop(enteredNextHop)
    const administrativeDistance = enteredDistance
      ? Number(enteredDistance)
      : 1
    if (
      normalizedNetwork !== null
      && nextHop
      && administrativeDistance >= 1
      && administrativeDistance <= 255
    ) {
      const route = {
        network: normalizedNetwork,
        mask,
        nextHop,
        administrativeDistance,
      }
      state.staticRoutes = state.staticRoutes.filter(
        (item) =>
          item.network !== route.network
          || item.mask !== route.mask
          || item.nextHop !== route.nextHop,
      )
      state.staticRoutes.push(route)
      configurationChanged = true
    } else accepted = false
  } else if (
    /^no ip route \S+ \S+ \S+( \d+)?$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const [, , , destination, mask, enteredNextHop] = command.split(' ')
    const normalizedNetwork = networkAddress(destination, mask)
    const nextHop = normalizeRouteNextHop(enteredNextHop)
    if (normalizedNetwork !== null && nextHop) {
      state.staticRoutes = state.staticRoutes.filter(
        (route) =>
          route.network !== normalizedNetwork
          || route.mask !== mask
          || route.nextHop !== nextHop,
      )
      configurationChanged = true
    } else accepted = false
  } else if (
    /^ip nat pool \S+ \S+ \S+ netmask \S+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const match = command.match(
      /^ip nat pool (\S+) (\S+) (\S+) netmask (\S+)$/i,
    )
    const name = canonicalNatPoolName(match[1])
    const startIp = match[2]
    const endIp = match[3]
    const netmask = match[4]
    const startNumber = ipv4ToNumber(startIp)
    const endNumber = ipv4ToNumber(endIp)
    if (
      startNumber !== null
      && endNumber !== null
      && startNumber <= endNumber
      && prefixLengthFromMask(netmask) !== null
    ) {
      state.natPools[name] = { name, startIp, endIp, netmask }
      configurationChanged = true
    } else accepted = false
  } else if (
    /^no ip nat pool \S+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const name = canonicalNatPoolName(command.split(' ').at(-1))
    delete state.natPools[name]
    state.natRules = state.natRules.filter(
      (rule) => !(rule.sourceType === 'pool' && rule.source === name),
    )
    configurationChanged = true
  } else if (
    /^ip nat inside source static \S+ \S+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const [, , , , , localIp, globalIp] = command.split(' ')
    if (ipv4ToNumber(localIp) !== null && ipv4ToNumber(globalIp) !== null) {
      const rule = { type: 'static', localIp, globalIp }
      state.natRules = state.natRules.filter(
        (item) => canonicalNatRule(item) !== canonicalNatRule(rule),
      )
      state.natRules.push(rule)
      configurationChanged = true
    } else accepted = false
  } else if (
    /^no ip nat inside source static \S+ \S+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const [, , , , , , localIp, globalIp] = command.split(' ')
    const rule = { type: 'static', localIp, globalIp }
    state.natRules = state.natRules.filter(
      (item) => canonicalNatRule(item) !== canonicalNatRule(rule),
    )
    configurationChanged = true
  } else if (
    /^ip dhcp excluded-address \S+( \S+)?$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const [, , , startIp, enteredEndIp] = command.split(' ')
    const endIp = enteredEndIp ?? startIp
    const startNumber = ipv4ToNumber(startIp)
    const endNumber = ipv4ToNumber(endIp)
    if (
      startNumber !== null
      && endNumber !== null
      && startNumber <= endNumber
    ) {
      state.dhcpExcludedRanges = state.dhcpExcludedRanges.filter(
        (range) => range.startIp !== startIp || range.endIp !== endIp,
      )
      state.dhcpExcludedRanges.push({ startIp, endIp })
      configurationChanged = true
    } else accepted = false
  } else if (
    /^no ip dhcp excluded-address \S+( \S+)?$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const [, , , , startIp, enteredEndIp] = command.split(' ')
    const endIp = enteredEndIp ?? startIp
    state.dhcpExcludedRanges = state.dhcpExcludedRanges.filter(
      (range) => range.startIp !== startIp || range.endIp !== endIp,
    )
    configurationChanged = true
  } else if (
    /^ip dhcp pool \S+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const poolName = canonicalDhcpPoolName(command.split(' ').at(-1))
    const existed = Boolean(state.dhcpPools[poolName])
    ensureDhcpPool(state, poolName)
    state.activeDhcpPool = poolName
    state.mode = 'dhcp_pool_config'
    configurationChanged = !existed
  } else if (
    /^no ip dhcp pool \S+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const poolName = canonicalDhcpPoolName(command.split(' ').at(-1))
    delete state.dhcpPools[poolName]
    configurationChanged = true
  } else if (state.mode === 'dhcp_pool_config') {
    const pool = ensureDhcpPool(state, state.activeDhcpPool)
    if (/^network \S+ \S+$/.test(lower)) {
      const [, enteredNetwork, mask] = command.split(' ')
      const normalizedNetwork = networkAddress(enteredNetwork, mask)
      if (normalizedNetwork !== null) {
        pool.network = normalizedNetwork
        pool.subnetMask = mask
        configurationChanged = true
      } else accepted = false
    } else if (lower === 'no network') {
      pool.network = ''
      pool.subnetMask = ''
      configurationChanged = true
    } else if (/^default-router( \S+)+$/.test(lower)) {
      const addresses = command.split(' ').slice(1)
      if (addresses.every((address) => ipv4ToNumber(address) !== null)) {
        pool.defaultRouters = addresses
        configurationChanged = true
      } else accepted = false
    } else if (lower === 'no default-router') {
      pool.defaultRouters = []
      configurationChanged = true
    } else if (/^dns-server( \S+)+$/.test(lower)) {
      const addresses = command.split(' ').slice(1)
      if (addresses.every((address) => ipv4ToNumber(address) !== null)) {
        pool.dnsServers = addresses
        configurationChanged = true
      } else accepted = false
    } else if (lower === 'no dns-server') {
      pool.dnsServers = []
      configurationChanged = true
    } else if (/^domain-name \S+$/.test(lower)) {
      pool.domainName = command.split(' ')[1]
      configurationChanged = true
    } else if (lower === 'no domain-name') {
      pool.domainName = ''
      configurationChanged = true
    } else if (/^lease (infinite|\d+( \d+( \d+)?)?)$/.test(lower)) {
      pool.lease = command.slice(6)
      configurationChanged = true
    } else if (lower === 'no lease') {
      pool.lease = ''
      configurationChanged = true
    } else {
      accepted = false
    }
  } else if (
    /^spanning-tree mode (pvst|rapid-pvst|mst)$/.test(lower)
    && state.mode === 'global_config'
  ) {
    state.spanningTree.mode = lower.split(' ').at(-1)
    configurationChanged = true
  } else if (
    /^spanning-tree vlan \d+ priority \d+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const match = lower.match(/^spanning-tree vlan (\d+) priority (\d+)$/)
    const vlanId = Number(match[1])
    const priority = Number(match[2])
    if (
      vlanId >= 1
      && vlanId <= 4094
      && priority >= 0
      && priority <= 61440
      && priority % 4096 === 0
    ) {
      state.spanningTree.vlanPriorities[String(vlanId)] = priority
      configurationChanged = true
    } else accepted = false
  } else if (
    /^spanning-tree vlan \d+ root (primary|secondary)$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const match = lower.match(
      /^spanning-tree vlan (\d+) root (primary|secondary)$/,
    )
    const vlanId = Number(match[1])
    if (vlanId >= 1 && vlanId <= 4094) {
      state.spanningTree.vlanPriorities[String(vlanId)] =
        match[2] === 'primary' ? 24576 : 28672
      configurationChanged = true
    } else accepted = false
  } else if (
    /^no spanning-tree vlan \d+ priority$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const vlanId = lower.split(' ')[2]
    delete state.spanningTree.vlanPriorities[vlanId]
    configurationChanged = true
  } else if (
    /^ip nat inside source list \S+ (interface|pool) \S+( overload)?$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const match = command.match(
      /^ip nat inside source list (\S+) (interface|pool) (\S+)( overload)?$/i,
    )
    const aclId = canonicalAccessListId(match[1])
    const sourceType = match[2].toLowerCase()
    const source = sourceType === 'interface'
      ? normalizeInterface(match[3])
      : canonicalNatPoolName(match[3])
    const overload = Boolean(match[4])
    const sourceExists = sourceType === 'interface'
      ? Boolean(source)
      : Boolean(state.natPools[source])
    if (sourceExists) {
      const rule = { type: 'dynamic', aclId, sourceType, source, overload }
      state.natRules = state.natRules.filter(
        (item) => canonicalNatRule(item) !== canonicalNatRule(rule),
      )
      state.natRules.push(rule)
      configurationChanged = true
    } else accepted = false
  } else if (
    /^no ip nat inside source list \S+ (interface|pool) \S+( overload)?$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const match = command.match(
      /^no ip nat inside source list (\S+) (interface|pool) (\S+)( overload)?$/i,
    )
    const sourceType = match[2].toLowerCase()
    const rule = {
      type: 'dynamic',
      aclId: canonicalAccessListId(match[1]),
      sourceType,
      source: sourceType === 'interface'
        ? normalizeInterface(match[3])
        : canonicalNatPoolName(match[3]),
      overload: Boolean(match[4]),
    }
    state.natRules = state.natRules.filter(
      (item) => canonicalNatRule(item) !== canonicalNatRule(rule),
    )
    configurationChanged = true
  } else if (
    /^access-list \d+ (permit|deny) .+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const match = command.match(/^access-list (\d+) (.+)$/i)
    const accessListId = match[1]
    const accessListType = accessListTypeForNumber(accessListId)
    const statement = accessListType
      ? normalizeAclStatement(match[2], accessListType)
      : null
    if (accessListType && statement) {
      const accessList = ensureAccessList(
        state,
        accessListId,
        accessListType,
        false,
      )
      addAccessListEntry(accessList, statement)
      configurationChanged = true
    } else accepted = false
  } else if (
    /^no access-list \d+( .+)?$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const match = command.match(/^no access-list (\d+)(?: (.+))?$/i)
    const accessListId = match[1]
    const accessList = state.accessLists[accessListId]
    if (!accessList) {
      accepted = false
    } else if (!match[2]) {
      delete state.accessLists[accessListId]
      Object.values(state.interfaces).forEach((item) => {
        if (item.ipAccessGroups?.in === accessListId) item.ipAccessGroups.in = ''
        if (item.ipAccessGroups?.out === accessListId) item.ipAccessGroups.out = ''
      })
      configurationChanged = true
    } else {
      const statement = normalizeAclStatement(match[2], accessList.type)
      if (!statement) {
        accepted = false
      } else {
        accessList.entries = accessList.entries.filter(
          (entry) => entry.statement !== statement,
        )
        configurationChanged = true
      }
    }
  } else if (
    /^ip access-list (standard|extended) [a-z0-9_-]+$/i.test(command)
    && state.mode === 'global_config'
  ) {
    const match = command.match(
      /^ip access-list (standard|extended) ([a-z0-9_-]+)$/i,
    )
    const accessListType = match[1].toLowerCase()
    const accessListId = canonicalAccessListId(match[2])
    const existingAccessList = state.accessLists[accessListId]
    if (existingAccessList && existingAccessList.type !== accessListType) {
      accepted = false
    } else {
      ensureAccessList(state, accessListId, accessListType, true)
      state.activeAccessList = accessListId
      state.mode = 'acl_config'
      configurationChanged = !existingAccessList
    }
  } else if (
    /^no ip access-list (standard|extended) [a-z0-9_-]+$/i.test(command)
    && state.mode === 'global_config'
  ) {
    const match = command.match(
      /^no ip access-list (standard|extended) ([a-z0-9_-]+)$/i,
    )
    const accessListId = canonicalAccessListId(match[2])
    if (state.accessLists[accessListId]) {
      delete state.accessLists[accessListId]
      Object.values(state.interfaces).forEach((item) => {
        if (item.ipAccessGroups?.in === accessListId) item.ipAccessGroups.in = ''
        if (item.ipAccessGroups?.out === accessListId) item.ipAccessGroups.out = ''
      })
      configurationChanged = true
    }
  } else if (state.mode === 'acl_config') {
    const accessList = state.accessLists[state.activeAccessList]
    if (!accessList) {
      accepted = false
    } else if (/^no \d+$/.test(lower)) {
      const sequence = Number(lower.split(' ')[1])
      accessList.entries = accessList.entries.filter(
        (entry) => Number(entry.sequence) !== sequence,
      )
      configurationChanged = true
    } else {
      const sequenceMatch = command.match(/^(\d+) (.+)$/)
      const isRemoval = lower.startsWith('no ')
      const rawStatement = isRemoval
        ? command.slice(3)
        : sequenceMatch?.[2] ?? command
      const statement = normalizeAclStatement(rawStatement, accessList.type)
      if (!statement) {
        accepted = false
      } else if (isRemoval) {
        accessList.entries = accessList.entries.filter(
          (entry) => entry.statement !== statement,
        )
        configurationChanged = true
      } else {
        addAccessListEntry(
          accessList,
          statement,
          sequenceMatch ? Number(sequenceMatch[1]) : null,
        )
        configurationChanged = true
      }
    }
  } else if (
    /^router ospf \d+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const processId = lower.split(' ')[2]
    const numericProcessId = Number(processId)
    if (numericProcessId >= 1 && numericProcessId <= 65535) {
      const processExists = Boolean(state.ospfProcesses[processId])
      ensureOspfProcess(state, processId)
      state.activeOspfProcess = processId
      state.mode = 'router_config'
      configurationChanged = !processExists
    } else accepted = false
  } else if (
    /^no router ospf \d+$/.test(lower)
    && state.mode === 'global_config'
  ) {
    const processId = lower.split(' ')[3]
    if (state.ospfProcesses[processId]) {
      delete state.ospfProcesses[processId]
      configurationChanged = true
    }
  } else if (state.mode === 'router_config') {
    const process = ensureOspfProcess(state, state.activeOspfProcess)
    if (/^router-id \S+$/.test(lower)) {
      const routerId = command.split(' ')[1]
      if (ipv4ToNumber(routerId) !== null) {
        process.routerId = routerId
        configurationChanged = true
      } else accepted = false
    } else if (lower === 'no router-id') {
      process.routerId = ''
      configurationChanged = true
    } else if (/^network \S+ \S+ area \S+$/.test(lower)) {
      const [, network, wildcard, , area] = command.split(' ')
      const numericArea = /^\d+$/.test(area) ? Number(area) : null
      const areaIsValid = (
        (numericArea !== null && numericArea <= 4294967295)
        || ipv4ToNumber(area) !== null
      )
      if (
        ipv4ToNumber(network) !== null
        && ipv4ToNumber(wildcard) !== null
        && areaIsValid
      ) {
        process.networks = process.networks.filter((item) =>
          item.network !== network
          || item.wildcard !== wildcard
          || String(item.area).toLowerCase() !== area.toLowerCase())
        process.networks.push({ network, wildcard, area })
        configurationChanged = true
      } else accepted = false
    } else if (/^no network \S+ \S+ area \S+$/.test(lower)) {
      const [, , network, wildcard, , area] = command.split(' ')
      process.networks = process.networks.filter((item) =>
        item.network !== network
        || item.wildcard !== wildcard
        || String(item.area).toLowerCase() !== area.toLowerCase())
      configurationChanged = true
    } else if (lower === 'passive-interface default') {
      process.passiveDefault = true
      process.passiveInterfaces = []
      configurationChanged = true
    } else if (lower === 'no passive-interface default') {
      process.passiveDefault = false
      process.nonPassiveInterfaces = []
      configurationChanged = true
    } else if (/^passive-interface \S+/.test(lower)) {
      const interfaceName = normalizeInterface(command.slice(18))
      if (interfaceName) {
        process.passiveInterfaces = [
          ...new Set([...process.passiveInterfaces, interfaceName]),
        ]
        process.nonPassiveInterfaces = process.nonPassiveInterfaces.filter(
          (item) => item !== interfaceName,
        )
        configurationChanged = true
      } else accepted = false
    } else if (/^no passive-interface \S+/.test(lower)) {
      const interfaceName = normalizeInterface(command.slice(21))
      if (interfaceName) {
        process.passiveInterfaces = process.passiveInterfaces.filter(
          (item) => item !== interfaceName,
        )
        process.nonPassiveInterfaces = [
          ...new Set([...process.nonPassiveInterfaces, interfaceName]),
        ]
        configurationChanged = true
      } else accepted = false
    } else if (lower === 'default-information originate') {
      process.defaultInformationOriginate = true
      configurationChanged = true
    } else if (lower === 'no default-information originate') {
      process.defaultInformationOriginate = false
      configurationChanged = true
    } else {
      accepted = false
    }
  } else if (
    /^username \S+( privilege \d+)? (secret|password) .+$/i.test(command)
    && state.mode === 'global_config'
  ) {
    const match = command.match(
      /^username (\S+)(?: privilege (\d+))? (secret|password) (.+)$/i,
    )
    const privilege = match[2] === undefined ? null : Number(match[2])
    if (privilege !== null && (privilege < 0 || privilege > 15)) {
      accepted = false
    } else {
      state.users[match[1]] = {
        secret: match[4],
        ...(match[3].toLowerCase() === 'password'
          ? { credentialType: 'password' }
          : {}),
        ...(privilege === null ? {} : { privilege }),
      }
      configurationChanged = true
    }
  } else if (/^no username \S+$/i.test(command) && state.mode === 'global_config') {
    delete state.users[command.split(' ')[2]]
    configurationChanged = true
  } else if (/^vlan \d+$/.test(lower) && state.mode === 'global_config') {
    const vlanId = lower.split(' ')[1]
    if (Number(vlanId) >= 1 && Number(vlanId) <= 4094) {
      state.vlans[vlanId] ??= { name: `VLAN${vlanId}` }
      state.activeVlan = vlanId
      state.mode = 'vlan_config'
      configurationChanged = true
    } else accepted = false
  } else if (lower.startsWith('name ') && state.mode === 'vlan_config') {
    state.vlans[state.activeVlan].name = command.slice(5).trim()
    configurationChanged = true
  } else if (lower === 'no name' && state.mode === 'vlan_config') {
    state.vlans[state.activeVlan].name = `VLAN${state.activeVlan}`
    configurationChanged = true
  } else if (
    (lower.startsWith('interface ') || lower.startsWith('int '))
    && state.mode === 'global_config'
  ) {
    const value = command.slice(command.indexOf(' ') + 1)
    const interfaceName = normalizeInterface(value)
    if (interfaceName) {
      ensureInterface(state, interfaceName)
      state.activeInterface = interfaceName
      state.mode = 'interface_config'
    } else accepted = false
  } else if (lower.startsWith('line ') && state.mode === 'global_config') {
    const lineName = normalizeLine(command.slice(5))
    if (lineName) {
      ensureLine(state, lineName)
      state.activeLine = lineName
      state.mode = 'line_config'
    } else accepted = false
  } else if (state.mode === 'line_config') {
    const line = ensureLine(state, state.activeLine)
    if (lower.startsWith('password ')) {
      line.password = command.slice(9).trim()
      configurationChanged = true
    } else if (lower === 'no password') {
      line.password = ''
      configurationChanged = true
    } else if (lower === 'login') {
      line.login = true
      line.loginLocal = false
      configurationChanged = true
    } else if (lower === 'login local') {
      line.loginLocal = true
      line.login = false
      configurationChanged = true
    } else if (lower === 'no login') {
      line.login = false
      line.loginLocal = false
      configurationChanged = true
    } else if (/^transport input (ssh|telnet|all|none|ssh telnet|telnet ssh)$/.test(lower)) {
      line.transportInput = lower.slice(16)
      configurationChanged = true
    } else {
      accepted = false
    }
  } else if (state.mode === 'interface_config') {
    const item = ensureInterface(state, state.activeInterface)
    if (lower.startsWith('description ')) {
      item.description = command.slice(12).trim()
      configurationChanged = true
    } else if (lower === 'no description') {
      item.description = ''
      configurationChanged = true
    } else if (/^encapsulation dot1q \d+( native)?$/.test(lower)) {
      const match = lower.match(/^encapsulation dot1q (\d+)( native)?$/)
      const vlanId = Number(match[1])
      if (vlanId >= 1 && vlanId <= 4094) {
        item.encapsulationDot1q = vlanId
        item.encapsulationNative = Boolean(match[2])
        state.vlans[String(vlanId)] ??= { name: `VLAN${vlanId}` }
        configurationChanged = true
      } else accepted = false
    } else if (lower === 'no encapsulation dot1q') {
      item.encapsulationDot1q = null
      item.encapsulationNative = false
      configurationChanged = true
    } else if (lower === 'switchport mode access') {
      item.switchportMode = 'access'
      configurationChanged = true
    } else if (lower === 'switchport mode trunk') {
      item.switchportMode = 'trunk'
      configurationChanged = true
    } else if (/^switchport access vlan \d+$/.test(lower)) {
      const vlanId = lower.split(' ').at(-1)
      if (Number(vlanId) >= 1 && Number(vlanId) <= 4094) {
        item.accessVlan = Number(vlanId)
        state.vlans[vlanId] ??= { name: `VLAN${vlanId}` }
        configurationChanged = true
      } else accepted = false
    } else if (lower === 'no switchport access vlan') {
      item.accessVlan = null
      configurationChanged = true
    } else if (/^switchport voice vlan \d+$/.test(lower)) {
      const vlanId = lower.split(' ').at(-1)
      if (Number(vlanId) >= 1 && Number(vlanId) <= 4094) {
        item.voiceVlan = Number(vlanId)
        state.vlans[vlanId] ??= { name: `VLAN${vlanId}` }
        configurationChanged = true
      } else accepted = false
    } else if (lower === 'no switchport voice vlan') {
      item.voiceVlan = null
      configurationChanged = true
    } else if (/^switchport trunk native vlan \d+$/.test(lower)) {
      const vlanId = Number(lower.split(' ').at(-1))
      if (vlanId >= 1 && vlanId <= 4094) {
        item.trunkNativeVlan = vlanId
        state.vlans[String(vlanId)] ??= { name: `VLAN${vlanId}` }
        configurationChanged = true
      } else accepted = false
    } else if (lower === 'no switchport trunk native vlan') {
      item.trunkNativeVlan = 1
      configurationChanged = true
    } else if (lower.startsWith('switchport trunk allowed vlan ')) {
      accepted = applyAllowedVlanCommand(item, lower)
      configurationChanged = accepted
    } else if (lower === 'no switchport trunk allowed vlan') {
      item.trunkAllowedVlans = null
      configurationChanged = true
    } else if (/^ip access-group \S+ (in|out)$/.test(lower)) {
      const [, , accessListValue, direction] = command.split(' ')
      const accessListId = canonicalAccessListId(accessListValue)
      if (state.accessLists[accessListId]) {
        item.ipAccessGroups[direction.toLowerCase()] = accessListId
        configurationChanged = true
      } else accepted = false
    } else if (/^no ip access-group \S+ (in|out)$/.test(lower)) {
      const [, , , accessListValue, direction] = command.split(' ')
      const accessListId = canonicalAccessListId(accessListValue)
      const normalizedDirection = direction.toLowerCase()
      if (item.ipAccessGroups[normalizedDirection] === accessListId) {
        item.ipAccessGroups[normalizedDirection] = ''
        configurationChanged = true
      }
    } else if (/^no ip access-group (in|out)$/.test(lower)) {
      const direction = lower.split(' ').at(-1)
      item.ipAccessGroups[direction] = ''
      configurationChanged = true
    } else if (lower === 'ip nat inside' || lower === 'ip nat outside') {
      item.natRole = lower.split(' ').at(-1)
      configurationChanged = true
    } else if (lower === 'no ip nat inside' || lower === 'no ip nat outside') {
      const role = lower.split(' ').at(-1)
      if (item.natRole === role) item.natRole = ''
      configurationChanged = true
    } else if (
      /^channel-group \d+ mode (active|passive|desirable|auto|on)$/.test(lower)
    ) {
      const match = lower.match(
        /^channel-group (\d+) mode (active|passive|desirable|auto|on)$/,
      )
      const groupId = Number(match[1])
      if (groupId >= 1 && groupId <= 128) {
        item.channelGroup = { id: groupId, mode: match[2] }
        ensureInterface(state, `Port-channel${groupId}`)
        configurationChanged = true
      } else accepted = false
    } else if (/^no channel-group( \d+)?$/.test(lower)) {
      item.channelGroup = null
      configurationChanged = true
    } else if (lower === 'spanning-tree portfast') {
      item.spanningTreePortfast = true
      configurationChanged = true
    } else if (lower === 'no spanning-tree portfast') {
      item.spanningTreePortfast = false
      configurationChanged = true
    } else if (lower === 'spanning-tree bpduguard enable') {
      item.spanningTreeBpduguard = true
      configurationChanged = true
    } else if (
      lower === 'no spanning-tree bpduguard enable'
      || lower === 'spanning-tree bpduguard disable'
    ) {
      item.spanningTreeBpduguard = false
      configurationChanged = true
    } else if (/^ip address \S+ \S+$/.test(lower)) {
      const [, , address, mask] = command.split(' ')
      if (
        ipv4ToNumber(address) !== null
        && prefixLengthFromMask(mask) !== null
      ) {
        item.ipAddress = address
        item.subnetMask = mask
        configurationChanged = true
      } else accepted = false
    } else if (lower === 'no ip address') {
      item.ipAddress = ''
      item.subnetMask = ''
      configurationChanged = true
    } else if (lower === 'no shutdown' || lower === 'no shut') {
      item.shutdown = false
      configurationChanged = true
    } else if (lower === 'shutdown' || lower === 'shut') {
      item.shutdown = true
      configurationChanged = true
    } else {
      accepted = false
    }
  } else if (
    [
      'write memory',
      'write mem',
      'wr',
      'copy running-config startup-config',
      'copy run start',
    ].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    state.saved = true
    output = 'Building configuration...\n[OK]'
  } else if (
    ['show running-config', 'show run'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    output = runningConfig(state)
  } else if (
    ['show startup-config', 'show start'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    output = state.saved
      ? runningConfig(state)
      : 'startup-config is not present'
  } else if (lower === 'show vlan brief' && state.mode === 'privileged_exec') {
    output = vlanBrief(state)
  } else if (
    ['show interfaces trunk', 'show interface trunk'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    output = interfacesTrunk(state)
  } else if (
    /^show interfaces? \S+ switchport$/.test(lower)
    && state.mode === 'privileged_exec'
  ) {
    const match = command.match(/^show interfaces? (.+) switchport$/i)
    const interfaceName = normalizeInterface(match[1])
    output = interfaceName
      ? interfaceSwitchport(state, interfaceName)
      : '% Invalid interface type and number'
  } else if (
    ['show ip interface brief', 'show ip int brief'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    output = [
      'Interface              IP-Address      OK? Method Status                Protocol',
      ...Object.entries(state.interfaces).map(([name, item]) =>
        `${name.padEnd(22)}${(item.ipAddress || 'unassigned').padEnd(16)}YES manual ${
          (item.shutdown ? 'administratively down' : 'up').padEnd(21)
        }${item.shutdown ? 'down' : 'up'}`),
    ].join('\n')
  } else if (
    /^(show access-lists?|show ip access-lists?)( \S+)?$/.test(lower)
    && state.mode === 'privileged_exec'
  ) {
    const requestedId = command.split(' ').at(-1)
    const hasRequestedId = !['access-list', 'access-lists'].includes(
      requestedId.toLowerCase(),
    )
    output = accessListsOutput(state, hasRequestedId ? requestedId : '')
  } else if (
    ['show ip nat translations', 'show ip nat translation'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    output = natTranslationsOutput(state)
  } else if (
    lower === 'show ip nat statistics'
    && state.mode === 'privileged_exec'
  ) {
    output = natStatisticsOutput(state)
  } else if (
    ['show ip dhcp pool', 'show ip dhcp binding'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    output = lower.endsWith('binding')
      ? 'Bindings from all pools not associated with VRF:\nNo bindings found.'
      : dhcpPoolOutput(state)
  } else if (
    ['show etherchannel summary', 'show etherchannel'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    output = etherchannelSummaryOutput(state)
  } else if (
    /^(show spanning-tree|show spanning-tree vlan \d+)$/.test(lower)
    && state.mode === 'privileged_exec'
  ) {
    const requestedVlan = lower.startsWith('show spanning-tree vlan ')
      ? lower.split(' ').at(-1)
      : ''
    output = spanningTreeOutput(state, requestedVlan)
  } else if (
    lower === 'show ip ssh'
    && state.mode === 'privileged_exec'
  ) {
    output = sshStatusOutput(state)
  } else if (
    ['show ip route', 'show ip route static', 'show ip route connected'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    output = ipRouteTable(state)
  } else if (
    ['show ip ospf', 'show ip ospf brief'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    output = ospfSummary(state)
  } else if (
    ['show ip ospf interface brief', 'show ip ospf int brief'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    output = ospfInterfaceBrief(state)
  } else if (
    ['show ip protocols', 'show ip protocol'].includes(lower)
    && state.mode === 'privileged_exec'
  ) {
    output = ipProtocols(state)
  } else if (
    lower === 'show ip route ospf'
    && state.mode === 'privileged_exec'
  ) {
    output = 'No OSPF routes are currently learned from neighbors.'
  } else {
    accepted = false
  }

  if (!accepted) output = "% Invalid input detected at '^' marker."
  if (accepted && configurationChanged) state.saved = false
  return { state, accepted, output, modeBefore, modeAfter: state.mode }
}

function addressMatchesNetwork(address, network, mask) {
  const addressNumber = ipv4ToNumber(address)
  const networkNumber = ipv4ToNumber(network)
  const maskNumber = ipv4ToNumber(mask)
  if (
    addressNumber === null
    || networkNumber === null
    || prefixLengthFromMask(mask) === null
  ) return false
  return ((addressNumber & maskNumber) >>> 0) === networkNumber
}

function interfaceContainsAddress(interfaceState, address) {
  if (
    !interfaceState
    || interfaceState.shutdown
    || !interfaceState.ipAddress
    || !interfaceState.subnetMask
  ) return false
  const network = networkAddress(
    interfaceState.ipAddress,
    interfaceState.subnetMask,
  )
  return network !== null
    && addressMatchesNetwork(address, network, interfaceState.subnetMask)
}

function matchingStaticRoute(state, destinationIp) {
  return (state.staticRoutes ?? [])
    .filter((route) =>
      addressMatchesNetwork(destinationIp, route.network, route.mask),
    )
    .sort(
      (left, right) =>
        prefixLengthFromMask(right.mask) - prefixLengthFromMask(left.mask),
    )[0] ?? null
}

function ospfInterfaceActivations(state, interfaceName) {
  return interfacesOnPhysicalPort(state, interfaceName)
    .flatMap(({ name, item }) => {
      if (!item.ipAddress || item.shutdown) return []

      return Object.values(state.ospfProcesses ?? {}).flatMap((process) => {
        const network = (process.networks ?? []).find((statement) =>
          ospfNetworkMatches(
            item.ipAddress,
            statement.network,
            statement.wildcard,
          ),
        )
        if (!network) return []

        const passive = process.passiveDefault
          ? !(process.nonPassiveInterfaces ?? []).includes(name)
          : (process.passiveInterfaces ?? []).includes(name)
        return [{ name, item, area: String(network.area), passive }]
      })
    })
}

function ospfReachableEndpoints({
  deviceStates,
  deviceTypes,
  topology,
  sourceDeviceId,
  sourceActivation,
}) {
  const adjacency = activeTopologyAdjacency(deviceStates, topology)
  const spanningTreeCache = new Map()
  const reachable = []
  const visited = new Set()
  const queue = []

  const inspectNeighbor = ({ edge, wireVlan }) => {
    const neighborState = deviceStates[edge.deviceId]
    const neighborType = deviceTypes.get(edge.deviceId) ?? 'router'
    if (!neighborState || edge.deviceId === sourceDeviceId) return

    if (neighborType !== 'switch' || neighborState.ipRouting) {
      if (!nonSwitchAcceptsWireVlan(
        neighborState,
        edge.neighborInterface,
        wireVlan,
      )) return
      for (const activation of ospfInterfaceActivations(
        neighborState,
        edge.neighborInterface,
      )) {
        const activationVlan = activation.item.encapsulationDot1q ?? null
        if (activationVlan !== wireVlan) continue
        reachable.push({ deviceId: edge.deviceId, activation })
      }
      return
    }

    const ingress = enterSwitchPort(
      neighborState.interfaces?.[edge.neighborInterface],
      wireVlan,
    )
    if (!ingress.allowed) return
    const visitKey = `${edge.deviceId}:${ingress.trafficVlan}`
    if (visited.has(visitKey)) return
    visited.add(visitKey)
    queue.push({
      deviceId: edge.deviceId,
      trafficVlan: ingress.trafficVlan,
    })
  }

  const sourceWireVlan = sourceActivation.item.encapsulationDot1q ?? null
  for (const edge of adjacency.get(sourceDeviceId) ?? []) {
    if (
      physicalInterfaceName(edge.outgoingInterface)
      !== physicalInterfaceName(sourceActivation.name)
    ) continue
    inspectNeighbor({ edge, wireVlan: sourceWireVlan })
  }

  while (queue.length) {
    const current = queue.shift()
    const currentState = deviceStates[current.deviceId]
    for (const edge of adjacency.get(current.deviceId) ?? []) {
      if (!spanningTreeAllowsEdge({
        deviceStates,
        deviceTypes,
        adjacency,
        cache: spanningTreeCache,
        currentDeviceId: current.deviceId,
        edge,
        vlanId: current.trafficVlan,
      })) continue
      const egress = leaveSwitchPort(
        currentState.interfaces?.[edge.outgoingInterface],
        current.trafficVlan,
      )
      if (!egress.allowed) continue
      inspectNeighbor({ edge, wireVlan: egress.wireVlan })
    }
  }

  return reachable
}

function buildOspfTopology(deviceStates, topology, devices = []) {
  const deviceTypes = new Map(
    (devices ?? []).map((device) => [device.id, device.type]),
  )
  for (const [deviceId, state] of Object.entries(deviceStates)) {
    if (!deviceTypes.has(deviceId)) {
      deviceTypes.set(deviceId, state.deviceType ?? 'router')
    }
  }
  const neighbors = new Map(
    Object.keys(deviceStates).map((deviceId) => [deviceId, new Set()]),
  )
  const neighborDetails = new Map(
    Object.keys(deviceStates).map((deviceId) => [deviceId, new Map()]),
  )

  for (const [sourceDeviceId, sourceState] of Object.entries(deviceStates)) {
    if (deviceTypes.get(sourceDeviceId) === 'pc') continue
    for (const sourceActivation of Object.keys(sourceState.interfaces ?? {})
      .flatMap((interfaceName) =>
        ospfInterfaceActivations(sourceState, interfaceName),
      )
      .filter((activation, index, activations) =>
        activations.findIndex((candidate) =>
          candidate.name === activation.name
          && candidate.area === activation.area,
        ) === index,
      )) {
      if (sourceActivation.passive) continue
      const endpoints = ospfReachableEndpoints({
        deviceStates,
        deviceTypes,
        topology,
        sourceDeviceId,
        sourceActivation,
      })
      for (const endpoint of endpoints) {
        const neighborActivation = endpoint.activation
        if (
          neighborActivation.passive
          || sourceActivation.area !== neighborActivation.area
          || !interfaceContainsAddress(
            sourceActivation.item,
            neighborActivation.item.ipAddress,
          )
          || !interfaceContainsAddress(
            neighborActivation.item,
            sourceActivation.item.ipAddress,
          )
        ) continue
        neighbors.get(sourceDeviceId)?.add(endpoint.deviceId)
        neighborDetails.get(sourceDeviceId)?.set(endpoint.deviceId, {
          localInterface: sourceActivation.name,
          neighborInterface: neighborActivation.name,
          neighborAddress: neighborActivation.item.ipAddress,
          area: sourceActivation.area,
        })
      }
    }
  }

  const advertisedNetworks = new Map(
    Object.entries(deviceStates).map(([deviceId, state]) => {
      const networks = Object.entries(state.interfaces ?? {})
        .filter(([, item]) => item.ipAddress && !item.shutdown)
        .filter(([, item]) =>
          Object.values(state.ospfProcesses ?? {}).some((process) =>
            (process.networks ?? []).some((statement) =>
              ospfNetworkMatches(
                item.ipAddress,
                statement.network,
                statement.wildcard,
              ),
            ),
          ),
        )
        .map(([, item]) => ({
          network: networkAddress(item.ipAddress, item.subnetMask),
          mask: item.subnetMask,
        }))
        .filter((network) => network.network !== null)
      return [deviceId, networks]
    }),
  )

  return { neighbors, neighborDetails, advertisedNetworks, deviceStates }
}

function ospfLearnedRoutes({
  ospfTopology,
  deviceStates,
  sourceDeviceId,
}) {
  const sourceState = deviceStates[sourceDeviceId]
  const connectedRouteKeys = new Set(
    Object.values(sourceState?.interfaces ?? {})
      .filter((item) => item.ipAddress && !item.shutdown)
      .map((item) =>
        `${networkAddress(item.ipAddress, item.subnetMask)}/${item.subnetMask}`,
      ),
  )
  const routes = new Map()
  const visited = new Set([sourceDeviceId])
  const queue = [...(ospfTopology.neighbors.get(sourceDeviceId) ?? [])]
    .map((deviceId) => ({ deviceId, firstHopId: deviceId, cost: 1 }))

  while (queue.length) {
    const current = queue.shift()
    if (visited.has(current.deviceId)) continue
    visited.add(current.deviceId)

    const nextHop = ospfTopology.neighborDetails
      .get(sourceDeviceId)?.get(current.firstHopId)
    for (const route of ospfTopology.advertisedNetworks.get(current.deviceId) ?? []) {
      const key = `${route.network}/${route.mask}`
      if (connectedRouteKeys.has(key) || routes.has(key)) continue
      routes.set(key, {
        ...route,
        cost: current.cost,
        nextHopAddress: nextHop?.neighborAddress ?? '',
        outgoingInterface: nextHop?.localInterface ?? '',
      })
    }

    for (const nextDeviceId of
      ospfTopology.neighbors.get(current.deviceId) ?? []) {
      if (visited.has(nextDeviceId)) continue
      queue.push({
        deviceId: nextDeviceId,
        firstHopId: current.firstHopId,
        cost: current.cost + 1,
      })
    }
  }
  return [...routes.values()]
}

function topologyOspfRoutesOutput({
  deviceStates,
  devices,
  activeDeviceId,
  topology,
}) {
  const ospfTopology = buildOspfTopology(deviceStates, topology, devices)
  const routes = ospfLearnedRoutes({
    ospfTopology,
    deviceStates,
    sourceDeviceId: activeDeviceId,
  })
  if (!routes.length) {
    return 'No OSPF routes are currently learned from neighbors.'
  }
  return routes.map((route) =>
    `O    ${route.network}/${prefixLengthFromMask(route.mask)} `
    + `[110/${route.cost}] via ${route.nextHopAddress}, `
    + abbreviateInterface(route.outgoingInterface),
  ).join('\n')
}

function topologyOspfNeighborsOutput({
  deviceStates,
  devices,
  activeDeviceId,
  topology,
}) {
  const ospfTopology = buildOspfTopology(deviceStates, topology, devices)
  const neighbors = [...(
    ospfTopology.neighborDetails.get(activeDeviceId)?.entries() ?? []
  )]
  if (!neighbors.length) return 'No OSPF neighbors are currently adjacent.'

  return [
    'Neighbor ID     Pri   State           Dead Time   Address         Interface',
    ...neighbors.map(([deviceId, detail]) => {
      const state = deviceStates[deviceId]
      const routerId = Object.values(state?.ospfProcesses ?? {})
        .find((process) => process.routerId)?.routerId
        ?? detail.neighborAddress
      return `${routerId.padEnd(16)}1     FULL/DR         00:00:39    `
        + `${detail.neighborAddress.padEnd(16)}`
        + abbreviateInterface(detail.localInterface)
    }),
  ].join('\n')
}

function ospfNeighborReachesDestination({
  ospfTopology,
  currentDeviceId,
  neighborDeviceId,
  destinationIp,
}) {
  if (!ospfTopology?.neighbors.get(currentDeviceId)?.has(neighborDeviceId)) {
    return false
  }

  const visited = new Set([currentDeviceId, neighborDeviceId])
  const queue = [neighborDeviceId]
  while (queue.length) {
    const deviceId = queue.shift()
    if ((ospfTopology.advertisedNetworks.get(deviceId) ?? []).some((route) =>
      addressMatchesNetwork(destinationIp, route.network, route.mask),
    )) return true

    for (const nextDeviceId of ospfTopology.neighbors.get(deviceId) ?? []) {
      if (visited.has(nextDeviceId)) continue
      visited.add(nextDeviceId)
      queue.push(nextDeviceId)
    }
  }
  return false
}

function ospfInterfaceReachesDestination({
  ospfTopology,
  deviceStates,
  currentDeviceId,
  outgoingInterface,
  destinationIp,
}) {
  return ospfLearnedRoutes({
    ospfTopology,
    deviceStates,
    sourceDeviceId: currentDeviceId,
  }).some((route) =>
    addressMatchesNetwork(destinationIp, route.network, route.mask)
    && physicalInterfaceName(route.outgoingInterface)
      === physicalInterfaceName(outgoingInterface),
  )
}

function physicalInterfaceName(interfaceName) {
  return String(interfaceName ?? '').split('.')[0]
}

function interfacesOnPhysicalPort(state, interfaceName) {
  const physicalName = physicalInterfaceName(interfaceName)
  return Object.entries(state?.interfaces ?? {})
    .filter(([name]) => physicalInterfaceName(name) === physicalName)
    .map(([name, item]) => ({ name, item }))
}

function etherchannelModesCompatible(leftMode, rightMode) {
  if (leftMode === 'on' || rightMode === 'on') {
    return leftMode === 'on' && rightMode === 'on'
  }

  const lacpModes = new Set(['active', 'passive'])
  if (lacpModes.has(leftMode) || lacpModes.has(rightMode)) {
    return lacpModes.has(leftMode)
      && lacpModes.has(rightMode)
      && (leftMode === 'active' || rightMode === 'active')
  }

  const pagpModes = new Set(['desirable', 'auto'])
  return pagpModes.has(leftMode)
    && pagpModes.has(rightMode)
    && (leftMode === 'desirable' || rightMode === 'desirable')
}

function etherchannelInterface(state, physicalInterface) {
  const member = state?.interfaces?.[physicalInterface]
  const groupId = member?.channelGroup?.id
  if (!groupId) return physicalInterface

  const portChannelName = `Port-channel${groupId}`
  const portChannel = state.interfaces?.[portChannelName]
  if (!portChannel) return physicalInterface

  const hasLogicalConfiguration = Boolean(
    portChannel.switchportMode
    || portChannel.ipAddress
    || portChannel.description
    || portChannel.ipAccessGroups?.in
    || portChannel.ipAccessGroups?.out
    || portChannel.natRole
    || portChannel.accessVlan
    || portChannel.voiceVlan
    || portChannel.trunkAllowedVlans !== null
    || Number(portChannel.trunkNativeVlan ?? 1) !== 1,
  )

  return hasLogicalConfiguration ? portChannelName : physicalInterface
}

function etherchannelBundleKey(link, fromGroup, toGroup) {
  const left = `${link.fromDeviceId}:${fromGroup}`
  const right = `${link.toDeviceId}:${toGroup}`
  return [left, right].sort().join('|')
}

function topologyLinkKey(link, fromInterface, toInterface) {
  if (link.id) return `link:${link.id}`
  return `link:${[
    `${link.fromDeviceId}:${fromInterface}`,
    `${link.toDeviceId}:${toInterface}`,
  ].sort().join('|')}`
}

function switchPortCarriesVlan(state, interfaceName, vlanId) {
  const item = state?.interfaces?.[interfaceName]
  if (!item || item.ipAddress) return false
  if (item.switchportMode === 'trunk') return trunkAllowsVlan(item, vlanId)
  return switchportAccessVlan(item) === Number(vlanId)
}

function spanningTreePriority(state, vlanId) {
  return Number(state?.spanningTree?.vlanPriorities?.[String(vlanId)] ?? 32768)
}

function spanningTreeForwardingLinks(
  deviceStates,
  deviceTypes,
  adjacency,
  vlanId,
) {
  const linksByKey = new Map()

  for (const [deviceId, edges] of adjacency.entries()) {
    const state = deviceStates[deviceId]
    if (deviceTypes.get(deviceId) !== 'switch') continue

    for (const edge of edges) {
      const neighborState = deviceStates[edge.deviceId]
      if (deviceTypes.get(edge.deviceId) !== 'switch') continue
      if (!switchPortCarriesVlan(state, edge.outgoingInterface, vlanId)) continue
      if (!switchPortCarriesVlan(
        neighborState,
        edge.neighborInterface,
        vlanId,
      )) continue

      if (!linksByKey.has(edge.linkKey)) {
        linksByKey.set(edge.linkKey, {
          key: edge.linkKey,
          leftDeviceId: deviceId,
          rightDeviceId: edge.deviceId,
        })
      }
    }
  }

  const graph = new Map()
  for (const link of linksByKey.values()) {
    if (!graph.has(link.leftDeviceId)) graph.set(link.leftDeviceId, [])
    if (!graph.has(link.rightDeviceId)) graph.set(link.rightDeviceId, [])
    graph.get(link.leftDeviceId).push({
      deviceId: link.rightDeviceId,
      linkKey: link.key,
    })
    graph.get(link.rightDeviceId).push({
      deviceId: link.leftDeviceId,
      linkKey: link.key,
    })
  }

  const forwarding = new Set()
  const remaining = new Set(graph.keys())

  while (remaining.size) {
    const componentStart = [...remaining].sort()[0]
    const component = []
    const componentVisited = new Set([componentStart])
    const componentQueue = [componentStart]

    while (componentQueue.length) {
      const current = componentQueue.shift()
      component.push(current)
      for (const edge of graph.get(current) ?? []) {
        if (componentVisited.has(edge.deviceId)) continue
        componentVisited.add(edge.deviceId)
        componentQueue.push(edge.deviceId)
      }
    }

    component.forEach((deviceId) => remaining.delete(deviceId))
    const rootId = component.sort((left, right) => {
      const priorityDifference = spanningTreePriority(
        deviceStates[left],
        vlanId,
      ) - spanningTreePriority(deviceStates[right], vlanId)
      return priorityDifference || left.localeCompare(right)
    })[0]

    const treeVisited = new Set([rootId])
    const treeQueue = [rootId]
    while (treeQueue.length) {
      const current = treeQueue.shift()
      const candidates = [...(graph.get(current) ?? [])].sort(
        (left, right) => left.deviceId.localeCompare(right.deviceId)
          || left.linkKey.localeCompare(right.linkKey),
      )
      for (const edge of candidates) {
        if (treeVisited.has(edge.deviceId)) continue
        treeVisited.add(edge.deviceId)
        treeQueue.push(edge.deviceId)
        forwarding.add(edge.linkKey)
      }
    }
  }

  return forwarding
}

function spanningTreeAllowsEdge({
  deviceStates,
  deviceTypes,
  adjacency,
  cache,
  currentDeviceId,
  edge,
  vlanId,
}) {
  if (
    deviceTypes.get(currentDeviceId) !== 'switch'
    || deviceTypes.get(edge.deviceId) !== 'switch'
    || !Number.isInteger(Number(vlanId))
  ) return true

  const cacheKey = String(vlanId)
  if (!cache.has(cacheKey)) {
    cache.set(
      cacheKey,
      spanningTreeForwardingLinks(
        deviceStates,
        deviceTypes,
        adjacency,
        vlanId,
      ),
    )
  }
  return cache.get(cacheKey).has(edge.linkKey)
}

function switchportAccessVlan(interfaceState) {
  return Number(interfaceState?.accessVlan ?? 1)
}

function switchportNativeVlan(interfaceState) {
  return Number(interfaceState?.trunkNativeVlan ?? 1)
}

function trunkAllowsVlan(interfaceState, vlanId) {
  const vlan = Number(vlanId)
  if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) return false
  if (interfaceState?.trunkAllowedVlans === null) return true
  return (interfaceState?.trunkAllowedVlans ?? []).map(Number).includes(vlan)
}

function leaveSwitchPort(interfaceState, trafficVlan) {
  const vlan = Number(trafficVlan)
  if (!Number.isInteger(vlan)) return { allowed: false, wireVlan: null }

  if (interfaceState?.switchportMode === 'trunk') {
    if (!trunkAllowsVlan(interfaceState, vlan)) {
      return { allowed: false, wireVlan: null }
    }
    return {
      allowed: true,
      wireVlan: vlan === switchportNativeVlan(interfaceState) ? null : vlan,
    }
  }

  return {
    allowed: switchportAccessVlan(interfaceState) === vlan,
    wireVlan: null,
  }
}

function enterSwitchPort(interfaceState, wireVlan) {
  if (interfaceState?.switchportMode === 'trunk') {
    const vlan = wireVlan ?? switchportNativeVlan(interfaceState)
    return {
      allowed: trunkAllowsVlan(interfaceState, vlan),
      trafficVlan: vlan,
    }
  }

  if (wireVlan !== null) return { allowed: false, trafficVlan: null }
  return {
    allowed: true,
    trafficVlan: switchportAccessVlan(interfaceState),
  }
}

function routedPortWireVlan(state, outgoingInterface, destinationIp) {
  const candidates = interfacesOnPhysicalPort(state, outgoingInterface)
  const route = matchingStaticRoute(state, destinationIp)
  const routeTarget = route?.nextHop ?? destinationIp
  const selected = candidates.find(({ item }) =>
    interfaceContainsAddress(item, routeTarget),
  ) ?? candidates.find(({ name }) => name === outgoingInterface)
    ?? candidates.find(({ item }) => !item.shutdown)

  return selected?.item?.encapsulationDot1q ?? null
}

function nonSwitchAcceptsWireVlan(state, neighborInterface, wireVlan) {
  const candidates = interfacesOnPhysicalPort(state, neighborInterface)
    .filter(({ item }) => !item.shutdown)
  if (wireVlan === null) {
    return candidates.some(({ item }) => item.encapsulationDot1q === null)
  }
  return candidates.some(
    ({ item }) => Number(item.encapsulationDot1q) === Number(wireVlan),
  )
}

function aclAddressMatches(expression, address) {
  const normalized = String(expression ?? '').trim().toLowerCase()
  if (normalized === 'any') return true
  if (normalized.startsWith('host ')) {
    return normalized.slice(5) === address
  }

  const [network, wildcard] = normalized.split(' ')
  const addressNumber = ipv4ToNumber(address)
  const networkNumber = ipv4ToNumber(network)
  const wildcardNumber = ipv4ToNumber(wildcard)
  if (
    addressNumber === null
    || networkNumber === null
    || wildcardNumber === null
  ) return false
  const significantBits = (~wildcardNumber) >>> 0
  return (addressNumber & significantBits) === (networkNumber & significantBits)
}

function aclEntryMatches(accessList, statement, packet) {
  const tokens = String(statement ?? '').split(' ')
  if (!['permit', 'deny'].includes(tokens[0])) return null

  if (accessList.type === 'standard') {
    const source = consumeAclAddress(tokens, 1)
    if (!source || !aclAddressMatches(source.value, packet.sourceIp)) return null
    return tokens[0]
  }

  const ruleProtocol = tokens[1]
  if (ruleProtocol !== 'ip' && ruleProtocol !== packet.protocol) return null
  const source = consumeAclAddress(tokens, 2)
  if (!source || !aclAddressMatches(source.value, packet.sourceIp)) return null
  const sourcePort = consumeAclPort(tokens, source.nextIndex)
  if (!sourcePort) return null
  const destination = consumeAclAddress(tokens, sourcePort.nextIndex)
  if (
    !destination
    || !aclAddressMatches(destination.value, packet.destinationIp)
  ) return null
  return tokens[0]
}

function accessListPermitsPacket(state, accessListId, packet) {
  if (!accessListId) return true
  const accessList = state.accessLists?.[canonicalAccessListId(accessListId)]
  if (!accessList) return true

  for (const entry of accessList.entries ?? []) {
    const action = aclEntryMatches(accessList, entry.statement, packet)
    if (action) return action === 'permit'
  }
  return false
}

function packetInterfaceState(state, interfaceName, wireVlan) {
  const candidates = interfacesOnPhysicalPort(state, interfaceName)
    .filter(({ item }) => !item.shutdown)
  if (wireVlan !== null) {
    return candidates.find(
      ({ item }) => Number(item.encapsulationDot1q) === Number(wireVlan),
    )?.item ?? state.interfaces?.[interfaceName] ?? null
  }
  return candidates.find(({ item }) => item.encapsulationNative)?.item
    ?? state.interfaces?.[interfaceName]
    ?? candidates.find(({ item }) => item.encapsulationDot1q === null)?.item
    ?? null
}

function interfaceAclPermitsPacket({
  state,
  interfaceName,
  direction,
  wireVlan,
  packet,
}) {
  const interfaceState = packetInterfaceState(state, interfaceName, wireVlan)
  return accessListPermitsPacket(
    state,
    interfaceState?.ipAccessGroups?.[direction],
    packet,
  )
}

function natInterfaceAddress(state, interfaceName) {
  return interfacesOnPhysicalPort(state, interfaceName)
    .map(({ item }) => item)
    .find((item) => !item.shutdown && item.ipAddress)?.ipAddress ?? ''
}

function outboundNatTranslation(state, deviceId, outgoingInterface, packet) {
  const staticRule = (state.natRules ?? []).find(
    (rule) => rule.type === 'static' && rule.localIp === packet.sourceIp,
  )
  if (staticRule) {
    return {
      deviceId,
      localIp: staticRule.localIp,
      globalIp: staticRule.globalIp,
    }
  }

  const dynamicRule = (state.natRules ?? []).find(
    (rule) => rule.type === 'dynamic'
      && accessListPermitsPacket(state, rule.aclId, packet),
  )
  if (!dynamicRule) return null

  const globalIp = dynamicRule.sourceType === 'pool'
    ? state.natPools?.[canonicalNatPoolName(dynamicRule.source)]?.startIp
    : natInterfaceAddress(state, dynamicRule.source || outgoingInterface)
  if (!globalIp) return null
  return {
    deviceId,
    localIp: packet.sourceIp,
    globalIp,
  }
}

function reverseNatPacket(state, deviceId, incomingInterface, wireVlan, packet, translations) {
  if (!incomingInterface) return packet
  const incomingState = packetInterfaceState(
    state,
    incomingInterface,
    wireVlan,
  )
  if (incomingState?.natRole !== 'outside') return packet

  const dynamicTranslation = (translations ?? []).find(
    (item) => item.deviceId === deviceId && item.globalIp === packet.destinationIp,
  )
  const staticRule = (state.natRules ?? []).find(
    (rule) => rule.type === 'static' && rule.globalIp === packet.destinationIp,
  )
  const localIp = dynamicTranslation?.localIp ?? staticRule?.localIp
  return localIp ? { ...packet, destinationIp: localIp } : packet
}

function applyOutboundNat({
  state,
  deviceId,
  incomingInterface,
  incomingWireVlan,
  outgoingInterface,
  wireVlan,
  packet,
  translations,
}) {
  if (!incomingInterface) {
    return { allowed: true, packet, translations }
  }
  const incomingState = packetInterfaceState(
    state,
    incomingInterface,
    incomingWireVlan,
  )
  const outgoingState = packetInterfaceState(state, outgoingInterface, wireVlan)
  const crossesInsideOutside = incomingState?.natRole === 'inside'
    && outgoingState?.natRole === 'outside'
  if (!crossesInsideOutside) {
    return { allowed: true, packet, translations }
  }

  const translation = outboundNatTranslation(
    state,
    deviceId,
    outgoingInterface,
    packet,
  )
  if (!translation) {
    return { allowed: false, packet, translations }
  }
  return {
    allowed: true,
    packet: { ...packet, sourceIp: translation.globalIp },
    translations: [
      ...(translations ?? []).filter((item) =>
        item.deviceId !== translation.deviceId
        || item.localIp !== translation.localIp),
      translation,
    ],
  }
}

function forwardAcrossTopologyEdge({
  currentState,
  currentType,
  outgoingInterface,
  neighborState,
  neighborType,
  neighborInterface,
  incomingInterface,
  incomingWireVlan,
  trafficVlan,
  packet,
  translations,
  currentDeviceId,
  destinationIp,
}) {
  let wireVlan = null

  if (currentType === 'switch' && !currentState.ipRouting) {
    const egress = leaveSwitchPort(
      currentState.interfaces?.[outgoingInterface],
      trafficVlan,
    )
    if (!egress.allowed) return { allowed: false, trafficVlan: null }
    wireVlan = egress.wireVlan
  } else if (currentType !== 'pc') {
    wireVlan = routedPortWireVlan(
      currentState,
      outgoingInterface,
      destinationIp,
    )
  }

  const natOutcome = applyOutboundNat({
    state: currentState,
    deviceId: currentDeviceId,
    incomingInterface,
    incomingWireVlan,
    outgoingInterface,
    wireVlan,
    packet,
    translations,
  })
  if (!natOutcome.allowed) return { allowed: false, trafficVlan: null }
  const forwardedPacket = natOutcome.packet

  if (!interfaceAclPermitsPacket({
    state: currentState,
    interfaceName: outgoingInterface,
    direction: 'out',
    wireVlan,
    packet: forwardedPacket,
  })) return { allowed: false, trafficVlan: null }

  if (!interfaceAclPermitsPacket({
    state: neighborState,
    interfaceName: neighborInterface,
    direction: 'in',
    wireVlan,
    packet: forwardedPacket,
  })) return { allowed: false, trafficVlan: null }

  if (neighborType === 'switch' && !neighborState.ipRouting) {
    const ingress = enterSwitchPort(
      neighborState.interfaces?.[neighborInterface],
      wireVlan,
    )
    return {
      allowed: ingress.allowed,
      trafficVlan: ingress.trafficVlan,
      wireVlan,
      packet: forwardedPacket,
      translations: natOutcome.translations,
    }
  }

  return {
    allowed: nonSwitchAcceptsWireVlan(
      neighborState,
      neighborInterface,
      wireVlan,
    ),
    trafficVlan: wireVlan,
    wireVlan,
    packet: forwardedPacket,
    translations: natOutcome.translations,
  }
}

function activeTopologyAdjacency(deviceStates, topology) {
  const adjacency = new Map(
    Object.keys(deviceStates).map((deviceId) => [deviceId, []]),
  )

  const addedBundles = new Set()

  for (const link of topology?.links ?? []) {
    const fromState = deviceStates[link.fromDeviceId]
    const toState = deviceStates[link.toDeviceId]
    const fromInterface = normalizeInterface(link.fromInterface)
    const toInterface = normalizeInterface(link.toInterface)
    const fromPortActive = fromInterface
      && interfacesOnPhysicalPort(fromState, fromInterface)
        .some(({ item }) => !item.shutdown)
    const toPortActive = toInterface
      && interfacesOnPhysicalPort(toState, toInterface)
        .some(({ item }) => !item.shutdown)
    if (!fromPortActive || !toPortActive) continue

    const fromChannel = fromState?.interfaces?.[fromInterface]?.channelGroup
    const toChannel = toState?.interfaces?.[toInterface]?.channelGroup
    let fromForwardingInterface = fromInterface
    let toForwardingInterface = toInterface
    let linkKey = topologyLinkKey(link, fromInterface, toInterface)

    if (fromChannel || toChannel) {
      if (!fromChannel || !toChannel) continue
      if (!etherchannelModesCompatible(fromChannel.mode, toChannel.mode)) continue

      const bundleKey = etherchannelBundleKey(
        link,
        fromChannel.id,
        toChannel.id,
      )
      if (addedBundles.has(bundleKey)) continue
      addedBundles.add(bundleKey)
      linkKey = `bundle:${bundleKey}`
      fromForwardingInterface = etherchannelInterface(fromState, fromInterface)
      toForwardingInterface = etherchannelInterface(toState, toInterface)
    }

    adjacency.get(link.fromDeviceId)?.push({
      deviceId: link.toDeviceId,
      outgoingInterface: fromForwardingInterface,
      neighborInterface: toForwardingInterface,
      linkKey,
    })
    adjacency.get(link.toDeviceId)?.push({
      deviceId: link.fromDeviceId,
      outgoingInterface: toForwardingInterface,
      neighborInterface: fromForwardingInterface,
      linkKey,
    })
  }

  return adjacency
}

function canForwardAcrossLink({
  state,
  deviceType,
  currentDeviceId,
  neighborDeviceId,
  outgoingInterface,
  destinationIp,
  ospfTopology,
}) {
  if (deviceType === 'switch' && !state.ipRouting) return true

  const outgoingCandidates = interfacesOnPhysicalPort(state, outgoingInterface)
  if (outgoingCandidates.some(({ item }) =>
    interfaceContainsAddress(item, destinationIp),
  )) return true

  if (deviceType === 'pc') {
    return Boolean(
      state.defaultGateway
      && outgoingCandidates.some(({ item }) =>
        interfaceContainsAddress(item, state.defaultGateway),
      ),
    )
  }

  const route = matchingStaticRoute(state, destinationIp)
  if (!route) {
    return ospfNeighborReachesDestination({
      ospfTopology,
      currentDeviceId,
      neighborDeviceId,
      destinationIp,
    })
      || ospfInterfaceReachesDestination({
        ospfTopology,
        deviceStates: ospfTopology.deviceStates,
        currentDeviceId,
        outgoingInterface,
        destinationIp,
      })
  }

  const normalizedNextHopInterface = normalizeInterface(route.nextHop)
  if (normalizedNextHopInterface) {
    return normalizedNextHopInterface === outgoingInterface
  }

  return outgoingCandidates.some(({ item }) =>
    interfaceContainsAddress(item, route.nextHop),
  )
}

function findRoutedTopologyPath({
  deviceStates,
  devices,
  topology,
  sourceDeviceId,
  destinationDeviceId,
  sourceIp,
  destinationIp,
  protocol = 'icmp',
  initialTranslations = [],
}) {
  const adjacency = activeTopologyAdjacency(deviceStates, topology)
  const ospfTopology = buildOspfTopology(deviceStates, topology, devices)
  const deviceTypes = new Map(
    (devices ?? []).map((device) => [device.id, device.type]),
  )
  const sourceState = deviceStates[sourceDeviceId]
  const sourceInterfaceEntry = Object.entries(sourceState?.interfaces ?? {})
    .find(([, item]) => item.ipAddress === sourceIp && !item.shutdown)
  const sourceSviMatch = sourceInterfaceEntry?.[0]?.match(/^Vlan(\d+)$/i)
  const initialTrafficVlan =
    deviceTypes.get(sourceDeviceId) === 'switch' && sourceSviMatch
      ? Number(sourceSviMatch[1])
      : null
  const spanningTreeCache = new Map()
  const visited = new Set([
    `${sourceDeviceId}:${initialTrafficVlan ?? 'untagged'}`,
  ])
  const queue = [{
    deviceId: sourceDeviceId,
    path: [sourceDeviceId],
    trafficVlan: initialTrafficVlan,
    incomingInterface: null,
    incomingWireVlan: null,
    packet: { sourceIp, destinationIp, protocol },
    translations: initialTranslations,
  }]

  while (queue.length) {
    const current = queue.shift()
    const currentState = deviceStates[current.deviceId]
    if (!currentState) continue
    const currentPacket = reverseNatPacket(
      currentState,
      current.deviceId,
      current.incomingInterface,
      current.incomingWireVlan,
      current.packet,
      current.translations,
    )
    if (current.deviceId === destinationDeviceId) {
      const ownsDestination = activeInterfaceAddresses(currentState)
        .includes(currentPacket.destinationIp)
      if (ownsDestination) {
        return {
          path: current.path,
          packet: currentPacket,
          translations: current.translations,
        }
      }
      continue
    }

    for (const edge of adjacency.get(current.deviceId) ?? []) {
      if (!spanningTreeAllowsEdge({
        deviceStates,
        deviceTypes,
        adjacency,
        cache: spanningTreeCache,
        currentDeviceId: current.deviceId,
        edge,
        vlanId: current.trafficVlan,
      })) continue

      if (!canForwardAcrossLink({
        state: currentState,
        deviceType: deviceTypes.get(current.deviceId) ?? 'router',
        currentDeviceId: current.deviceId,
        neighborDeviceId: edge.deviceId,
        outgoingInterface: edge.outgoingInterface,
        destinationIp: currentPacket.destinationIp,
        ospfTopology,
      })) continue

      const neighborState = deviceStates[edge.deviceId]
      if (!neighborState) continue
      const forwarding = forwardAcrossTopologyEdge({
        currentState,
        currentType: deviceTypes.get(current.deviceId) ?? 'router',
        outgoingInterface: edge.outgoingInterface,
        neighborState,
        neighborType: deviceTypes.get(edge.deviceId) ?? 'router',
        neighborInterface: edge.neighborInterface,
        incomingInterface: current.incomingInterface,
        incomingWireVlan: current.incomingWireVlan,
        trafficVlan: current.trafficVlan,
        packet: currentPacket,
        translations: current.translations,
        currentDeviceId: current.deviceId,
        destinationIp: currentPacket.destinationIp,
      })
      if (!forwarding.allowed) continue
      const nextTrafficVlan = forwarding.trafficVlan

      const visitKey = [
        edge.deviceId,
        nextTrafficVlan ?? 'untagged',
        forwarding.packet.sourceIp,
        forwarding.packet.destinationIp,
      ].join(':')
      if (visited.has(visitKey)) continue

      visited.add(visitKey)
      queue.push({
        deviceId: edge.deviceId,
        path: [...current.path, edge.deviceId],
        trafficVlan: nextTrafficVlan,
        incomingInterface: edge.neighborInterface,
        incomingWireVlan: forwarding.wireVlan,
        packet: forwarding.packet,
        translations: forwarding.translations,
      })
    }
  }

  return null
}

function activeInterfaceAddresses(state) {
  return Object.values(state?.interfaces ?? {})
    .filter((item) => item.ipAddress && !item.shutdown)
    .map((item) => item.ipAddress)
}

function resolveTopologyDestination(deviceStates, destinationIp) {
  const directEntry = Object.entries(deviceStates).find(
    ([, state]) => activeInterfaceAddresses(state).includes(destinationIp),
  )
  if (directEntry) return directEntry

  for (const [, state] of Object.entries(deviceStates)) {
    const staticRule = (state.natRules ?? []).find(
      (rule) => rule.type === 'static' && rule.globalIp === destinationIp,
    )
    if (!staticRule) continue
    const insideEntry = Object.entries(deviceStates).find(
      ([, candidate]) => activeInterfaceAddresses(candidate)
        .includes(staticRule.localIp),
    )
    if (insideEntry) return insideEntry
  }
  return null
}

function topologyHopLabel(deviceId, deviceStates, devices) {
  const device = (devices ?? []).find((item) => item.id === deviceId)
  const state = deviceStates[deviceId]
  const address = activeInterfaceAddresses(state)[0]
  return `${state?.hostname || device?.label || deviceId}${
    address ? ` (${address})` : ''
  }`
}

function sshServerIsReady(state, username) {
  const vty = state?.lines?.vty
  const transports = String(vty?.transportInput ?? '').split(/\s+/)
  return Boolean(
    state?.domainName
    && Number(state?.rsaKeyBits) >= 512
    // RSA-enabled IOS accepts SSH before version 2 is forced explicitly.
    // The secure SSH grading criterion still checks for version 2 separately.
    && [1, 2].includes(Number(state?.sshVersion))
    && state?.users?.[username]?.secret
    && vty?.loginLocal
    && (transports.includes('ssh') || transports.includes('all')),
  )
}

export function executeSshSessionCommand({
  deviceStates,
  activeDeviceId,
  rawCommand,
}) {
  const sourceState = deviceStates[activeDeviceId]
  const session = sourceState?.sshSession
  if (!session?.destinationDeviceId) return null

  const destinationState = deviceStates[session.destinationDeviceId]
  const command = String(rawCommand ?? '').trim().replace(/\s+/g, ' ')
  const modeBefore = session.remoteMode ?? 'privileged_exec'

  if (!destinationState) {
    const disconnectedState = structuredClone(sourceState)
    delete disconnectedState.sshSession
    return {
      state: disconnectedState,
      accepted: false,
      output: '% SSH connection lost: remote device is unavailable.',
      modeBefore,
      modeAfter: sourceState.mode,
      sessionClosed: true,
    }
  }

  if (
    ['user_exec', 'privileged_exec'].includes(modeBefore)
    && ['exit', 'logout', 'disconnect'].includes(command.toLowerCase())
  ) {
    const disconnectedState = structuredClone(sourceState)
    delete disconnectedState.sshSession
    return {
      state: disconnectedState,
      destinationDeviceId: session.destinationDeviceId,
      destinationState: structuredClone(destinationState),
      accepted: true,
      output: `Connection to ${session.destinationIp} closed.`,
      modeBefore,
      modeAfter: sourceState.mode,
      sessionClosed: true,
    }
  }

  const remoteSessionState = structuredClone(destinationState)
  remoteSessionState.mode = modeBefore
  if (['user_exec', 'privileged_exec'].includes(modeBefore)) {
    remoteSessionState.activeVlan = null
    remoteSessionState.activeInterface = null
    remoteSessionState.activeLine = null
    remoteSessionState.activeOspfProcess = null
    remoteSessionState.activeAccessList = null
    remoteSessionState.activeDhcpPool = null
  }
  const outcome = executeCiscoCommand(remoteSessionState, command)
  const nextSourceState = structuredClone(sourceState)
  nextSourceState.sshSession = {
    ...session,
    remoteMode: outcome.state.mode,
  }

  return {
    ...outcome,
    state: nextSourceState,
    destinationDeviceId: session.destinationDeviceId,
    destinationState: outcome.state,
    sessionClosed: false,
  }
}

export function executeTopologyCommand({
  deviceStates,
  activeDeviceId,
  devices = [],
  topology,
  rawCommand,
}) {
  const command = String(rawCommand ?? '').trim().replace(/\s+/g, ' ')
  const match = command.match(/^(ping|traceroute|tracert) (\S+)$/i)
  const ciscoSshMatch = command.match(
    /^ssh (?:-v 2 )?-l (\S+) (?:-v 2 )?(\S+)$/i,
  )
  const pcSshMatch = command.match(/^ssh (\S+)@(\S+)$/i)
  const sshMatch = ciscoSshMatch ?? pcSshMatch
  const showOspfRoutes = /^show ip route ospf$/i.test(command)
  const showOspfNeighbors = /^show ip ospf neighbors?$/i.test(command)
  if (!match && !sshMatch && !showOspfRoutes && !showOspfNeighbors) return null

  const currentState = deviceStates[activeDeviceId]
  const modeBefore = currentState?.mode ?? 'user_exec'
  if (!['user_exec', 'privileged_exec'].includes(modeBefore)) {
    return {
      state: structuredClone(currentState),
      accepted: false,
      output: "% Invalid input detected at '^' marker.",
      modeBefore,
      modeAfter: modeBefore,
    }
  }

  if (showOspfRoutes || showOspfNeighbors) {
    if (modeBefore !== 'privileged_exec') {
      return {
        state: structuredClone(currentState),
        accepted: false,
        output: "% Invalid input detected at '^' marker.",
        modeBefore,
        modeAfter: modeBefore,
      }
    }
    return {
      state: structuredClone(currentState),
      accepted: true,
      output: showOspfRoutes
        ? topologyOspfRoutesOutput({
            deviceStates,
            devices,
            activeDeviceId,
            topology,
          })
        : topologyOspfNeighborsOutput({
            deviceStates,
            devices,
            activeDeviceId,
            topology,
          }),
      modeBefore,
      modeAfter: modeBefore,
    }
  }

  const operation = sshMatch
    ? 'ssh'
    : match[1].toLowerCase() === 'ping'
      ? 'ping'
      : 'traceroute'
  const protocol = operation === 'ssh'
    ? 'tcp'
    : ['ping', 'tracert'].includes(match[1].toLowerCase())
      ? 'icmp'
      : 'udp'
  const sshUsername = sshMatch?.[1] ?? ''
  const destinationIp = sshMatch?.[2] ?? match[2]
  if (ipv4ToNumber(destinationIp) === null) {
    return {
      state: structuredClone(currentState),
      accepted: false,
      output: '% Unrecognized host or address.',
      modeBefore,
      modeAfter: modeBefore,
    }
  }

  const destinationEntry = resolveTopologyDestination(
    deviceStates,
    destinationIp,
  )
  const sourceAddresses = activeInterfaceAddresses(currentState)
  const sourceIp = sourceAddresses.find((address) => {
    const sourceInterface = Object.values(currentState.interfaces ?? {})
      .find((item) => item.ipAddress === address)
    return interfaceContainsAddress(sourceInterface, destinationIp)
  }) ?? sourceAddresses[0]
  const destinationDeviceId = destinationEntry?.[0]
  const forwardPath = destinationDeviceId && sourceAddresses.length
    ? findRoutedTopologyPath({
        deviceStates,
        devices,
        topology,
        sourceDeviceId: activeDeviceId,
        destinationDeviceId,
        sourceIp,
        destinationIp,
        protocol,
      })
    : null
  const destinationAddresses = destinationDeviceId
    ? activeInterfaceAddresses(deviceStates[destinationDeviceId])
    : []
  const returnPath = forwardPath
    ? findRoutedTopologyPath({
      deviceStates,
      devices,
      topology,
      sourceDeviceId: destinationDeviceId,
      destinationDeviceId: activeDeviceId,
      sourceIp: forwardPath.packet.destinationIp,
      destinationIp: forwardPath.packet.sourceIp,
      protocol,
      initialTranslations: forwardPath.translations,
    })
    : null

  const destinationState = destinationDeviceId
    ? deviceStates[destinationDeviceId]
    : null
  const successful = operation === 'traceroute'
    ? Boolean(forwardPath)
    : Boolean(
      forwardPath
      && returnPath
      && destinationAddresses.length
      && (operation !== 'ssh'
        || sshServerIsReady(destinationState, sshUsername)),
    )
  const state = structuredClone(currentState)
  if (operation === 'ping') {
    state.successfulPings ??= []
  } else if (operation === 'traceroute') {
    state.successfulTraceroutes ??= []
  } else {
    state.successfulSshConnections ??= []
  }
  if (successful && operation === 'ping') {
    state.successfulPings = [
      ...new Set([...state.successfulPings, destinationIp]),
    ]
  }

  if (successful && operation === 'traceroute') {
    state.successfulTraceroutes = [
      ...new Set([...state.successfulTraceroutes, destinationIp]),
    ]
  }

  if (successful && operation === 'ssh') {
    state.successfulSshConnections = [
      ...new Set([
        ...state.successfulSshConnections,
        `${sshUsername}@${destinationIp}`,
      ]),
    ]
    state.sshSession = {
      destinationDeviceId,
      destinationIp,
      username: sshUsername,
      remoteMode: 'privileged_exec',
    }
  }

  if (operation === 'traceroute') {
    const hopLines = forwardPath
      ? forwardPath.path.slice(1).map(
          (deviceId, index) =>
            ` ${index + 1}  ${topologyHopLabel(
              deviceId,
              deviceStates,
              devices,
            )}  1 ms  2 ms  1 ms`,
        )
      : [' 1  *  *  *', ' 2  *  *  *', ' 3  *  *  *']

    return {
      state,
      accepted: true,
      output: [
        `Tracing the route to ${destinationIp}`,
        ...hopLines,
        successful ? 'Trace complete.' : 'Destination unreachable.',
      ].join('\n'),
      modeBefore,
      modeAfter: modeBefore,
    }
  }

  if (operation === 'ssh') {
    return {
      state,
      accepted: true,
      output: successful
        ? [
          `Open`,
          `[Connection to ${destinationIp} established using SSH version 2]`,
          `${destinationState.hostname}#`,
        ].join('\n')
        : `% Connection refused by remote host`,
      modeBefore,
      modeAfter: modeBefore,
    }
  }

  return {
    state,
    accepted: true,
    output: [
      `Type escape sequence to abort.`,
      `Sending 5, 100-byte ICMP Echos to ${destinationIp}, timeout is 2 seconds:`,
      successful ? '!!!!!' : '.....',
      `Success rate is ${successful ? '100' : '0'} percent (5/5)${
        successful ? ', round-trip min/avg/max = 1/2/4 ms' : ''
      }`,
    ].join('\n'),
    modeBefore,
    modeAfter: modeBefore,
  }
}
