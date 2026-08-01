import assert from 'node:assert/strict'
import test from 'node:test'
import {
  criterionTypesForDevice,
  defaultCriterionTarget,
  firstCriterionTypeForDevice,
  isCriterionApplicable,
  isPresetApplicable,
} from './cliCriterionApplicability.js'

test('limits PC criteria to address, gateway, and connectivity checks', () => {
  assert.equal(isCriterionApplicable('pc', 'interface_ip'), true)
  assert.equal(isCriterionApplicable('pc', 'default_gateway'), true)
  assert.equal(isCriterionApplicable('pc', 'connectivity_ping'), true)
  assert.equal(isCriterionApplicable('pc', 'pc_dns_servers'), true)
  assert.equal(isCriterionApplicable('pc', 'hostname'), false)
  assert.equal(isCriterionApplicable('pc', 'vlan_exists'), false)
  assert.equal(firstCriterionTypeForDevice('pc'), 'interface_ip')
  assert.equal(defaultCriterionTarget('pc', 'interface_ip'), 'Ethernet0')
})

test('separates switch-only and router-only criteria', () => {
  assert.equal(isCriterionApplicable('switch', 'vlan_exists'), true)
  assert.equal(isCriterionApplicable('router', 'vlan_exists'), false)
  assert.equal(isCriterionApplicable('router', 'nat_dynamic_rule'), true)
  assert.equal(isCriterionApplicable('switch', 'nat_dynamic_rule'), false)
  assert.equal(isCriterionApplicable('router', 'interface_dot1q'), true)
})

test('filters displayed choices and quick presets by device type', () => {
  const choices = [
    ['hostname', 'Hostname'],
    ['vlan_exists', 'VLAN exists'],
    ['nat_dynamic_rule', 'PAT'],
  ]
  assert.deepEqual(
    criterionTypesForDevice('switch', choices).map(([type]) => type),
    ['hostname', 'vlan_exists'],
  )
  assert.equal(isPresetApplicable('switch', 'vlan_access'), true)
  assert.equal(isPresetApplicable('router', 'vlan_access'), false)
  assert.equal(isPresetApplicable('pc', 'basic_device'), false)
})
