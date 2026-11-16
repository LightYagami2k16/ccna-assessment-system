import { useState } from 'react'
import CliReviewDeviceFilter from './CliReviewDeviceFilter'
import { groupCliReviewCriteria } from '../services/cliReviewDevices'
import './CliReviewDeviceGroups.css'

export default function CliReviewDeviceGroups({ criteria = [], state, children, filterable = false }) {
  const [selectedKey, setSelectedKey] = useState('all')
  const groups = groupCliReviewCriteria(criteria, state)
  const selected = groups.find(group => JSON.stringify(group.deviceId) === selectedKey)
  const visible = filterable && selected ? [selected] : groups
  return <>
    {filterable && <CliReviewDeviceFilter groups={groups} value={selected ? selectedKey : 'all'} onChange={setSelectedKey} />}
    <div className="cli-review-device-groups">{visible.map(group => {
    const identity = group.deviceId == null ? 'Device ID not recorded' : `Device ID: ${group.deviceId}`
    return <section className="cli-review-device-group" key={JSON.stringify(group.deviceId)} aria-label={`${group.name} (${identity})`}>
      <header className="cli-review-device-group__heading">
        <h4>{group.name}</h4>
        <span>{group.deviceId == null ? identity : <>Device ID: <code>{group.deviceId}</code></>}</span>
      </header>
      <div className="cli-criterion-review-list">{group.criteria.map((criterion, index) => children(criterion, index))}</div>
    </section>
  })}</div></>
}
