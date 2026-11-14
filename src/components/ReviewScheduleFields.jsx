import { useId } from 'react'
import './ReviewScheduleFields.css'

export default function ReviewScheduleFields({ value, onChange, disabled = false }) {
  const descriptionId = useId()
  const enabled = value.mode !== 'disabled'
  return <fieldset className="review-schedule-fields" disabled={disabled} aria-describedby={descriptionId}>
    <legend>Student attempt review</legend>
    <p id={descriptionId}>Allow students to see their submitted work, scoring feedback, correct answers and expected configuration after completing an attempt.</p>
    <label className="check-control review-schedule-fields__enable">
      <input type="checkbox" checked={enabled} onChange={(event) => onChange({ ...value, mode: event.target.checked ? 'immediate' : 'disabled' })} />
      <span>Allow students to review completed attempts</span>
    </label>
    {enabled && <>
      <label>Review availability
        <select value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value })}>
          <option value="immediate">After submission</option>
          <option value="scheduled">Scheduled window</option>
        </select>
      </label>
      {value.mode === 'scheduled' && <div className="review-schedule-fields__dates">
        <label>Review opens<input type="datetime-local" step="any" required value={value.opensAt} onChange={(event) => onChange({ ...value, opensAt: event.target.value })} /></label>
        <label>Review closes (optional)<input type="datetime-local" step="any" value={value.closesAt} onChange={(event) => onChange({ ...value, closesAt: event.target.value })} /></label>
        <p>Times use your local time zone. Leave the closing time empty to keep review available.</p>
      </div>}
    </>}
  </fieldset>
}
