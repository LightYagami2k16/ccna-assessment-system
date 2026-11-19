import {firstCriterionTypeForDevice,defaultCriterionTarget,isCriterionApplicable} from './cliCriterionApplicability.js'

export const criterionTypes = [
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
  ['default_gateway', 'Device default gateway'],
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
  ['interface_nat_role', 'Interface NAT role'],
  ['nat_pool', 'NAT address pool'],
  ['nat_static_mapping', 'Static NAT mapping'],
  ['nat_dynamic_rule', 'Dynamic NAT or PAT rule'],
  ['dhcp_pool_exists', 'DHCP pool exists'],
  ['dhcp_network', 'DHCP pool network'],
  ['dhcp_default_router', 'DHCP default router'],
  ['dhcp_dns_server', 'DHCP DNS servers'],
  ['dhcp_excluded_range', 'DHCP excluded address range'],
  ['etherchannel_member', 'EtherChannel member'],
  ['stp_mode', 'Spanning Tree mode'],
  ['stp_vlan_priority', 'Spanning Tree VLAN priority'],
  ['interface_portfast', 'Interface PortFast enabled'],
  ['interface_bpduguard', 'Interface BPDU Guard enabled'],
  ['ssh_rsa_keys', 'RSA key size'],
  ['ssh_version', 'SSH version'],
  ['line_login_local', 'Line local login enabled'],
  ['connectivity_ping', 'Successful topology ping'],
  ['connectivity_traceroute', 'Successful topology traceroute'],
  ['connectivity_ssh', 'Successful topology SSH connection'],
  ['pc_dns_servers', 'PC DNS servers'],
  ['config_saved', 'Configuration saved'],
]

export const criterionTypeLabels = Object.fromEntries(criterionTypes)
export const presetOptions = [
  ['basic_device', 'Basic device configuration'],
  ['vlan_access', 'VLAN and access ports'],
  ['router_on_stick', 'Router-on-a-stick'],
  ['static_routing', 'Static routing'],
  ['single_area_ospf', 'Single-area OSPF'],
  ['standard_acl', 'Standard ACL'],
  ['extended_acl', 'Extended ACL'],
  ['nat_pat', 'NAT and PAT'],
  ['dhcp_server', 'DHCP server'],
  ['etherchannel', 'EtherChannel'],
  ['spanning_tree', 'Spanning Tree'],
  ['secure_ssh', 'Secure SSH management'],
]
export const sensitiveCriterionTypes = new Set([
  'enable_secret',
  'local_user',
  'line_password',
])

export const targetNotRequired = [
  'hostname',
  'enable_secret',
  'password_encryption',
  'banner_motd',
  'domain_name',
  'ip_routing_enabled',
  'default_gateway',
  'default_route',
  'stp_mode',
  'ssh_rsa_keys',
  'ssh_version',
  'connectivity_ping',
  'connectivity_traceroute',
  'connectivity_ssh',
  'pc_dns_servers',
  'config_saved',
]

export const expectedNotRequired = [
  'password_encryption',
  'line_login',
  'vlan_exists',
  'interface_enabled',
  'ip_routing_enabled',
  'ospf_process',
  'ospf_default_information',
  'acl_exists',
  'dhcp_pool_exists',
  'interface_portfast',
  'interface_bpduguard',
  'line_login_local',
  'config_saved',
]

export function blankCriterion(deviceId = 'device-1', deviceType = 'switch') {
  const type = firstCriterionTypeForDevice(deviceType)
  return {
    type,
    deviceId,
    target: defaultCriterionTarget(deviceType, type),
    expected: '',
    points: 10,
  }
}

export function normalizeCriterionForDevice(criterion, deviceType, deviceId) {
  if (isCriterionApplicable(deviceType, criterion.type)) {
    return { ...criterion, deviceId }
  }
  const type = firstCriterionTypeForDevice(deviceType)
  return {
    ...criterion,
    type,
    deviceId,
    target: defaultCriterionTarget(deviceType, type),
    expected: '',
  }
}

export function presetCriteria(preset) {
  const criterion = (type, expected = '') => ({
    type,
    deviceId: 'device-1',
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
    nat_pat: [
      criterion('acl_exists'),
      criterion('acl_entry'),
      criterion('interface_nat_role', 'inside'),
      criterion('interface_nat_role', 'outside'),
      criterion('nat_dynamic_rule'),
      criterion('config_saved'),
    ],
    dhcp_server: [
      criterion('dhcp_excluded_range'),
      criterion('dhcp_pool_exists'),
      criterion('dhcp_network'),
      criterion('dhcp_default_router'),
      criterion('dhcp_dns_server'),
      criterion('config_saved'),
    ],
    etherchannel: [
      criterion('interface_mode', 'trunk'),
      criterion('etherchannel_member'),
      criterion('etherchannel_member'),
      criterion('config_saved'),
    ],
    spanning_tree: [
      criterion('stp_mode', 'rapid-pvst'),
      criterion('stp_vlan_priority'),
      criterion('interface_portfast'),
      criterion('interface_bpduguard'),
      criterion('config_saved'),
    ],
    secure_ssh: [
      criterion('hostname'),
      criterion('domain_name'),
      criterion('local_user'),
      criterion('ssh_rsa_keys', '2048'),
      criterion('ssh_version', '2'),
      criterion('line_login_local'),
      criterion('line_transport_input', 'ssh'),
      criterion('config_saved'),
    ],
  }

  return presets[preset] ?? []
}

export function criterionSummary(criterion) {
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

export function criterionRequiredState(type) {
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

export function configurationCommands(...commands) {
  return [
    'enable',
    'configure terminal',
    ...commands.filter(Boolean),
    'end',
  ]
}

export function lineConfigurationTarget(target) {
  const normalized = String(target ?? '').trim().toLowerCase()
  if (normalized === 'console' || normalized === 'console 0') {
    return 'line console 0'
  }
  if (normalized === 'vty') return 'line vty 0 4'
  return `line ${String(target ?? '').trim()}`
}

export function inferNamedAclType(statement) {
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

export function aclConfigurationCommands(target, statement = '') {
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

export function criterionConfigurationCommands(criterion, allCriteria, deviceType) {
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
      if (deviceType === 'pc') {
        return [`IP Configuration > IP address and subnet mask: ${expected}`]
      }
      return interfaceCommands(`ip address ${expected}`)
    case 'ip_routing_enabled':
      return configurationCommands('ip routing')
    case 'default_gateway':
      if (deviceType === 'pc') {
        return [`IP Configuration > Default gateway: ${expected}`]
      }
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
    case 'interface_nat_role':
      return interfaceCommands(`ip nat ${expected}`)
    case 'nat_pool':
      return configurationCommands(`ip nat pool ${target} ${expected}`)
    case 'nat_static_mapping':
      return configurationCommands(
        `ip nat inside source static ${target} ${expected}`,
      )
    case 'nat_dynamic_rule':
      return configurationCommands(
        `ip nat inside source list ${target} ${expected}`,
      )
    case 'dhcp_pool_exists':
      return configurationCommands(`ip dhcp pool ${target}`, 'exit')
    case 'dhcp_network':
      return configurationCommands(
        `ip dhcp pool ${target}`,
        `network ${expected}`,
        'exit',
      )
    case 'dhcp_default_router':
      return configurationCommands(
        `ip dhcp pool ${target}`,
        `default-router ${expected}`,
        'exit',
      )
    case 'dhcp_dns_server':
      return configurationCommands(
        `ip dhcp pool ${target}`,
        `dns-server ${expected}`,
        'exit',
      )
    case 'dhcp_excluded_range':
      return configurationCommands(
        `ip dhcp excluded-address ${target} ${expected}`,
      )
    case 'etherchannel_member':
      return interfaceCommands(`channel-group ${expected}`)
    case 'stp_mode':
      return configurationCommands(`spanning-tree mode ${expected}`)
    case 'stp_vlan_priority':
      return configurationCommands(
        `spanning-tree vlan ${target} priority ${expected}`,
      )
    case 'interface_portfast':
      return interfaceCommands('spanning-tree portfast')
    case 'interface_bpduguard':
      return interfaceCommands('spanning-tree bpduguard enable')
    case 'ssh_rsa_keys':
      return configurationCommands(
        `crypto key generate rsa modulus ${expected}`,
      )
    case 'ssh_version':
      return configurationCommands(`ip ssh version ${expected}`)
    case 'line_login_local':
      return configurationCommands(
        lineConfigurationTarget(target),
        'login local',
        'exit',
      )
    case 'connectivity_ping':
      return [`ping ${expected}`]
    case 'connectivity_traceroute':
      return [`traceroute ${expected}`]
    case 'connectivity_ssh': {
      const [username, address] = expected.split('@')
      return deviceType === 'pc'
        ? [`ssh ${expected}`]
        : [`ssh -l ${username || '<username>'} ${address || '<address>'}`]
    }
    case 'pc_dns_servers':
      return [`IP Configuration > DNS servers: ${expected}`]
    case 'config_saved':
      return ['enable', 'copy running-config startup-config']
    default:
      return configurationCommands(
        `! Configure ${criterionTypeLabels[criterion.type] ?? criterion.type}`,
      )
  }
}

export function generateDeviceId(devices = []) {
  const existingIds = new Set(
    devices.map((device) => String(device.id).trim().toLowerCase()),
  )
  let id = ''

  do {
    const token = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 10)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    id = `dev_${token}`
  } while (existingIds.has(id.toLowerCase()))

  return id
}

export function blankLab() {
  const primaryDeviceId = generateDeviceId()

  return {
    id: '',
    courseId: '',
    moduleId: '',
    title: '',
    description: '',
    instructions: '',
    deviceType: 'switch',
    initialHostname: '',
    devices: [
      {
        id: primaryDeviceId,
        label: '',
        hostname: '',
        type: 'switch',
      },
    ],
    topology: { links: [] },
    durationMinutes: 30,
    maxAttempts: 1,
    passingScore: 70,
    status: 'draft',
    classIds: [],
    criteria: [blankCriterion(primaryDeviceId)],
  }
}

export function criterionHelp(type) {
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
  if (type === 'default_gateway') return 'Expected value: the switch or PC default gateway'
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
  if (type === 'interface_nat_role') return 'Target: interface; expected: inside or outside'
  if (type === 'nat_pool') return 'Target: pool name; expected: start-IP end-IP netmask subnet-mask'
  if (type === 'nat_static_mapping') return 'Target: inside-local IP; expected: inside-global IP'
  if (type === 'nat_dynamic_rule') return 'Target: ACL number or name; expected: interface G0/1 overload or pool POOL-NAME overload'
  if (type === 'dhcp_pool_exists') return 'Target: DHCP pool name'
  if (type === 'dhcp_network') return 'Target: pool name; expected: network and subnet mask'
  if (type === 'dhcp_default_router') return 'Target: pool name; expected: one or more router IP addresses'
  if (type === 'dhcp_dns_server') return 'Target: pool name; expected: one or more DNS server IP addresses'
  if (type === 'dhcp_excluded_range') return 'Target: first excluded IP; expected: last excluded IP'
  if (type === 'etherchannel_member') return 'Target: physical interface; expected: channel number and mode, such as 1 active'
  if (type === 'stp_mode') return 'Expected: pvst, rapid-pvst, or mst'
  if (type === 'stp_vlan_priority') return 'Target: VLAN number; expected: priority such as 24576'
  if (type === 'interface_portfast') return 'Target: access interface'
  if (type === 'interface_bpduguard') return 'Target: access interface'
  if (type === 'ssh_rsa_keys') return 'Expected: minimum RSA key size, such as 2048'
  if (type === 'ssh_version') return 'Expected: 2'
  if (type === 'line_login_local') return 'Target: vty'
  if (type === 'connectivity_ping') return 'Expected: destination interface IP that this device must successfully ping'
  if (type === 'pc_dns_servers') return 'Expected: preferred DNS followed by optional alternate DNS, such as 8.8.8.8 1.1.1.1'
  if (type === 'connectivity_traceroute') return 'Expected: destination interface IP that this device must successfully trace'
  if (type === 'connectivity_ssh') return 'Expected: username@destination-IP, such as admin@192.168.1.1'
  return 'No target or expected value is needed.'
}
