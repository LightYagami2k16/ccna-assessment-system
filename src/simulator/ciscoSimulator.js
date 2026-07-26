export function createDeviceState(hostname = 'Switch') {
  return {
    hostname,
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
    saved: false,
  }
}

function ensureStateShape(state) {
  state.vlans ??= {}
  state.interfaces ??= {}
  state.enableSecret ??= ''
  state.servicePasswordEncryption ??= false
  state.bannerMotd ??= ''
  state.domainName ??= ''
  state.users ??= {}
  state.lines ??= {}
  state.activeLine ??= null
  state.saved ??= false
  return state
}

export function getDevicePrompt(state) {
  const hostname = state.hostname || 'Switch'
  const suffix = {
    user_exec: '>',
    privileged_exec: '#',
    global_config: '(config)#',
    vlan_config: '(config-vlan)#',
    interface_config: '(config-if)#',
    line_config: '(config-line)#',
  }[state.mode]
  return `${hostname}${suffix ?? '>'}`
}

export function normalizeInterface(value) {
  const compact = String(value ?? '').replaceAll(' ', '').toLowerCase()
  const patterns = [
    {
      expression: /^(fastethernet|fa|f)(\d+(?:\/\d+){1,2})$/,
      prefix: 'FastEthernet',
    },
    {
      expression: /^(gigabitethernet|gi|g)(\d+(?:\/\d+){1,2})$/,
      prefix: 'GigabitEthernet',
    },
    {
      expression: /^(tengigabitethernet|te)(\d+(?:\/\d+){1,2})$/,
      prefix: 'TenGigabitEthernet',
    },
    {
      expression: /^(ethernet|e)(\d+(?:\/\d+){1,2})$/,
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
      expression: /^(serial|s)(\d+(?:\/\d+){1,2})$/,
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
    ipAddress: '',
    subnetMask: '',
    shutdown: true,
  }
  const item = state.interfaces[name]
  item.description ??= ''
  item.switchportMode ??= ''
  item.accessVlan ??= null
  item.voiceVlan ??= null
  item.trunkNativeVlan ??= 1
  item.trunkAllowedVlans ??= null
  item.ipAddress ??= ''
  item.subnetMask ??= ''
  item.shutdown ??= true
  return item
}

function ensureLine(state, name) {
  state.lines[name] ??= {
    password: '',
    login: false,
    transportInput: '',
  }
  return state.lines[name]
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

function runningConfig(state) {
  const lines = [`hostname ${state.hostname}`]
  if (state.enableSecret) lines.push(`enable secret ${state.enableSecret}`)
  if (state.servicePasswordEncryption) lines.push('service password-encryption')
  if (state.bannerMotd) lines.push(`banner motd #${state.bannerMotd}#`)
  if (state.domainName) lines.push(`ip domain-name ${state.domainName}`)
  Object.entries(state.users).forEach(([username, user]) => {
    lines.push(`username ${username} secret ${user.secret}`)
  })
  Object.entries(state.vlans).forEach(([id, vlan]) => {
    lines.push('!', `vlan ${id}`)
    if (vlan.name) lines.push(` name ${vlan.name}`)
  })
  Object.entries(state.interfaces).forEach(([name, item]) => {
    lines.push('!', `interface ${name}`)
    if (item.description) lines.push(` description ${item.description}`)
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
    lines.push(item.shutdown ? ' shutdown' : ' no shutdown')
  })
  Object.entries(state.lines).forEach(([name, line]) => {
    lines.push('!', `line ${name === 'console' ? 'console 0' : 'vty 0 4'}`)
    if (line.password) lines.push(` password ${line.password}`)
    if (line.login) lines.push(' login')
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
    && ['global_config', 'vlan_config', 'interface_config', 'line_config'].includes(state.mode)
  ) {
    state.mode = 'privileged_exec'
    state.activeVlan = null
    state.activeInterface = null
    state.activeLine = null
  } else if (lower === 'exit') {
    if (['vlan_config', 'interface_config', 'line_config'].includes(state.mode)) {
      state.mode = 'global_config'
      state.activeVlan = null
      state.activeInterface = null
      state.activeLine = null
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
  } else if (/^username \S+ secret .+$/i.test(command) && state.mode === 'global_config') {
    const match = command.match(/^username (\S+) secret (.+)$/i)
    state.users[match[1]] = { secret: match[2] }
    configurationChanged = true
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
      configurationChanged = true
    } else if (lower === 'no login') {
      line.login = false
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
    } else if (/^ip address \S+ \S+$/.test(lower)) {
      const [, , address, mask] = command.split(' ')
      item.ipAddress = address
      item.subnetMask = mask
      configurationChanged = true
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
  } else {
    accepted = false
  }

  if (!accepted) output = "% Invalid input detected at '^' marker."
  if (accepted && configurationChanged) state.saved = false
  return { state, accepted, output, modeBefore, modeAfter: state.mode }
}
