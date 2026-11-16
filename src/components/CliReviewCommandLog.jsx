import { useState } from 'react'
import { groupCliReviewCommands } from '../services/cliReviewDevices'
import CliReviewDeviceFilter from './CliReviewDeviceFilter'
import './CliReviewCommandLog.css'

export default function CliReviewCommandLog({ commands = [], criteria = [], state }) {
  const [selectedKey, setSelectedKey] = useState('all')
  const groups = groupCliReviewCommands(commands, criteria, state)
  const selected = groups.find(group => JSON.stringify(group.deviceId) === selectedKey)
  const visible = selected ? [selected] : groups
  return <div className="cli-review-command-log">
    <CliReviewDeviceFilter groups={groups} value={selected ? selectedKey : 'all'} onChange={setSelectedKey} />
    {!groups.length && <p>No commands recorded.</p>}
    {visible.map(group => {
      const identity = group.deviceId == null ? 'Device ID not recorded' : `Device ID: ${group.deviceId}`
      return <section className="cli-review-command-device" key={JSON.stringify(group.deviceId)} aria-label={`${group.name} (${identity}) command log`}>
        <header className="cli-review-command-device__heading"><h4>{group.name}</h4><span>{identity}</span></header>
        {group.commands.length ? <ol className="cli-review-command-list">
          {group.commands.map((command, index) => <li key={`${command.sequence ?? index}:${index}`}>
            <div className="cli-review-command-list__status"><span>#{command.sequence ?? '—'}</span><span className={command.accepted === true ? 'command-valid' : command.accepted === false ? 'command-invalid' : ''}>
              {command.accepted === true ? 'Accepted' : command.accepted === false ? 'Not accepted' : 'Status not recorded'}
            </span></div>
            <code>{command.command}</code>
            {command.output && <pre>{command.output}</pre>}
          </li>)}
        </ol> : <p>No commands recorded for this device.</p>}
      </section>
    })}
  </div>
}
