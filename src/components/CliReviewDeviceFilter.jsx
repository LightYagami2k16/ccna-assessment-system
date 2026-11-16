import { useId } from 'react'
import './CliReviewDeviceFilter.css'

export default function CliReviewDeviceFilter({ groups, value, onChange }) {
  const id = useId()
  return <div className="cli-review-device-filter">
    <label htmlFor={id}>Filter by device</label>
    <select id={id} value={value} disabled={!groups.length} onChange={event => onChange(event.target.value)}>
      <option value="all">All devices</option>
      {groups.map(group => <option key={JSON.stringify(group.deviceId)} value={JSON.stringify(group.deviceId)}>
        {group.name} ({group.deviceId == null ? 'Device ID not recorded' : `Device ID: ${group.deviceId}`}){group.commands ? ` · ${group.commands.length} ${group.commands.length === 1 ? 'command' : 'commands'}` : ''}
      </option>)}
    </select>
  </div>
}
