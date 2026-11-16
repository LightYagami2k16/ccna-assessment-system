export function groupCliReviewCriteria(criteria = [], state = {}) {
  const groups = new Map()
  for (const criterion of criteria) {
    const deviceId = criterion.deviceId == null || String(criterion.deviceId).trim() === '' ? null : String(criterion.deviceId)
    if (!groups.has(deviceId)) {
      const metadata = deviceId == null ? null : Array.isArray(state?.devices)
        ? state.devices.find(device => String(device.id) === deviceId) : state?.devices?.[deviceId]
      const saved = deviceId == null ? null : state?.deviceStates?.[deviceId]
      const name = saved?.hostname || metadata?.hostname || metadata?.label
        || (deviceId == null ? state?.hostname : '') || 'Device name not recorded'
      groups.set(deviceId, { deviceId, name, criteria: [] })
    }
    groups.get(deviceId).criteria.push(criterion)
  }
  return [...groups.values()]
}


export function groupCliReviewCommands(commands = [], criteria = [], state = {}) {
  const savedDevices = Array.isArray(state?.devices) ? state.devices
    : Object.keys(state?.devices ?? {}).map(deviceId => ({ deviceId }))
  const identities = [
    ...Object.keys(state?.deviceStates ?? {}).map(deviceId => ({ deviceId })),
    ...savedDevices.map(device => ({ deviceId: device.deviceId ?? device.id })),
    ...criteria, ...commands,
  ]
  const groups = groupCliReviewCriteria(identities, state).map(({ deviceId, name }) => ({ deviceId, name, commands: [] }))
  const byId = new Map(groups.map(group => [group.deviceId, group]))
  const sequence = command => Number.isFinite(Number(command.sequence)) && command.sequence != null ? Number(command.sequence) : Infinity
  for (const command of [...commands].sort((a, b) => sequence(a) - sequence(b))) {
    const deviceId = command.deviceId == null || String(command.deviceId).trim() === '' ? null : String(command.deviceId)
    byId.get(deviceId).commands.push(command)
  }
  return groups
}
