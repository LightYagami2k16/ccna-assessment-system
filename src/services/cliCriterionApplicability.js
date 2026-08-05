const commonIosCriteria = [
  'hostname',
  'enable_secret',
  'password_encryption',
  'banner_motd',
  'domain_name',
  'local_user',
  'line_password',
  'line_login',
  'line_transport_input',
  'interface_description',
  'interface_enabled',
  'interface_ip',
  'acl_exists',
  'acl_entry',
  'interface_acl',
  'dhcp_pool_exists',
  'dhcp_network',
  'dhcp_default_router',
  'dhcp_dns_server',
  'dhcp_excluded_range',
  'ssh_rsa_keys',
  'ssh_version',
  'line_login_local',
  'connectivity_ping',
  'connectivity_traceroute',
  'connectivity_ssh',
  'config_saved',
]

const applicableCriteria = {
  pc: new Set([
    'interface_ip',
    'default_gateway',
    'connectivity_ping',
    'connectivity_traceroute',
    'connectivity_ssh',
    'pc_dns_servers',
  ]),
  router: new Set([
    ...commonIosCriteria,
    'interface_dot1q',
    'interface_dot1q_native',
    'static_route',
    'default_route',
    'ospf_process',
    'ospf_router_id',
    'ospf_network',
    'ospf_passive_interface',
    'ospf_default_information',
    'interface_nat_role',
    'nat_pool',
    'nat_static_mapping',
    'nat_dynamic_rule',
  ]),
  switch: new Set([
    ...commonIosCriteria,
    'vlan_exists',
    'vlan_name',
    'interface_mode',
    'interface_access_vlan',
    'interface_voice_vlan',
    'interface_trunk_native_vlan',
    'interface_trunk_allowed_vlans',
    'ip_routing_enabled',
    'default_gateway',
    'static_route',
    'default_route',
    'ospf_process',
    'ospf_router_id',
    'ospf_network',
    'ospf_passive_interface',
    'ospf_default_information',
    'etherchannel_member',
    'stp_mode',
    'stp_vlan_priority',
    'interface_portfast',
    'interface_bpduguard',
  ]),
}

const presetDeviceTypes = {
  basic_device: new Set(['router', 'switch']),
  vlan_access: new Set(['switch']),
  router_on_stick: new Set(['router']),
  static_routing: new Set(['router', 'switch']),
  single_area_ospf: new Set(['router', 'switch']),
  standard_acl: new Set(['router', 'switch']),
  extended_acl: new Set(['router', 'switch']),
  nat_pat: new Set(['router']),
  dhcp_server: new Set(['router', 'switch']),
  etherchannel: new Set(['switch']),
  spanning_tree: new Set(['switch']),
  secure_ssh: new Set(['router', 'switch']),
}

export function isCriterionApplicable(deviceType, criterionType) {
  return (applicableCriteria[deviceType] ?? applicableCriteria.switch)
    .has(criterionType)
}

export function criterionTypesForDevice(deviceType, criterionTypes) {
  return criterionTypes.filter(([type]) =>
    isCriterionApplicable(deviceType, type),
  )
}

export function firstCriterionTypeForDevice(deviceType) {
  return deviceType === 'pc' ? 'interface_ip' : 'hostname'
}

export function defaultCriterionTarget(deviceType, criterionType) {
  return deviceType === 'pc' && criterionType === 'interface_ip'
    ? 'Ethernet0'
    : ''
}

export function isPresetApplicable(deviceType, preset) {
  return Boolean(presetDeviceTypes[preset]?.has(deviceType))
}
