import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { getAssessmentReviewPolicy, setAssessmentReviewSchedule } from '../services/assessmentReviewPolicyService'
import { emptyReviewSchedule, reviewScheduleFromPolicy, reviewScheduleToPolicy, validateReviewSchedule } from '../services/reviewSchedule'
import ReviewScheduleFields from './ReviewScheduleFields'
import './AssessmentReviewPolicy.css'

export default function AssessmentReviewPolicy({ assessmentType, assessmentId }) {
  const titleId = useId()
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(emptyReviewSchedule)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [readError, setReadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const requestVersion = useRef(0)
  const load = useCallback(async () => {
    const request = ++requestVersion.current
    setLoading(true)
    setSaving(false)
    setSaved(null)
    setDraft(emptyReviewSchedule())
    setSaveError('')
    setReadError('')
    setNotice('')
    try {
      const next = reviewScheduleFromPolicy(await getAssessmentReviewPolicy(assessmentType, assessmentId))
      if (request !== requestVersion.current) return
      setSaved(next)
      setDraft(next)
    } catch {
      if (request === requestVersion.current) setReadError('Review settings are unavailable. Please try again.')
    } finally {
      if (request === requestVersion.current) setLoading(false)
    }
  }, [assessmentType, assessmentId])
  useEffect(() => {
    void load()
    return () => { requestVersion.current += 1 }
  }, [load])
  const validation = validateReviewSchedule(draft)
  const changed = saved && (draft.mode !== saved.mode || draft.opensAt !== saved.opensAt || draft.closesAt !== saved.closesAt)
  async function save() {
    if (validation || !saved) return
    const request = ++requestVersion.current
    setSaving(true)
    setSaveError('')
    setNotice('')
    try {
      const policy = await setAssessmentReviewSchedule(assessmentType, assessmentId, reviewScheduleToPolicy(draft))
      if (request !== requestVersion.current) return
      const next = reviewScheduleFromPolicy(policy)
      setSaved(next)
      setDraft(next)
      setNotice('Review access saved.')
    } catch {
      if (request === requestVersion.current) setSaveError('Review access could not be saved. Please try again.')
    } finally {
      if (request === requestVersion.current) setSaving(false)
    }
  }
  return <section className="assessment-review-policy" aria-labelledby={titleId}>
    <h3 id={titleId}>Student attempt review</h3>
    <p>Students can review their submitted work, scoring feedback, and {assessmentType === 'quiz' ? 'correct answers' : 'expected CLI configuration'} when access opens.</p>
    <p>Applies to completed attempts, including earlier submissions. Scores remain visible when review is disabled.</p>
    {loading ? <p role="status">Loading review settings...</p> : readError ? <>
      <p className="form-message form-message--error" role="alert">{readError}</p>
      <button className="secondary" type="button" onClick={() => void load()}>Retry review settings</button>
    </> : <>
      <ReviewScheduleFields value={draft} disabled={saving || saved === null} onChange={(next) => { setDraft(next); setNotice(''); setSaveError('') }} />
      {validation && <p className="form-message form-message--error" role="alert">{validation}</p>}
      <button className="primary" type="button" onClick={() => void save()} disabled={saving || !saved || !changed || Boolean(validation)}>{saving ? 'Saving review access...' : 'Save review access'}</button>
      {saveError && <p className="form-message form-message--error" role="alert">{saveError}</p>}
      {notice && <p role="status">{notice}</p>}
    </>}
  </section>
}
