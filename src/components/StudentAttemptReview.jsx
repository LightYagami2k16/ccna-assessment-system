import { useCallback, useEffect, useRef, useState } from 'react'
import { getStudentAttemptReview } from '../services/studentAttemptReviewService'
import useStudentPageRefresh from '../hooks/useStudentPageRefresh'
import LibraryItemDialog from './LibraryItemDialog'
import './StudentAttemptReview.css'

function label(value) {
  return String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, (character) => character.toUpperCase())
}

function ValueDetails({ value }) {
  if (value == null || value === '') return <span>Not recorded</span>
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>
  if (typeof value !== 'object') return <span>{String(value)}</span>
  const entries = Array.isArray(value) ? value.map((item, index) => [index + 1, item]) : Object.entries(value)
  if (!entries.length) return <span>None recorded</span>
  return <dl className="student-attempt-review__values">{entries.map(([key, item]) => <div key={key}>
    <dt>{item && typeof item === 'object' && item.hostname ? item.hostname : label(key)}</dt><dd><ValueDetails value={item} /></dd>
  </div>)}</dl>
}

function QuizReview({ questions = [] }) {
  return <section aria-label="Question review">{questions.length ? [...questions].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((question, index) => {
    const selected = new Set((question.selectedOptionIds ?? []).map(String))
    const identification = question.type === 'identification'
    const missingChoices = [...selected].filter((id) => !(question.options ?? []).some((option) => String(option.id) === id))
    const acceptedAnswers = question.correctAnswers?.length ? question.correctAnswers : identification ? (question.options ?? []).filter((option) => option.isCorrect).map((option) => option.text) : []
    return <article className="student-attempt-review__card" key={question.id ?? index}>
      <h3>{question.title || `Question ${index + 1}`}</h3>
      <p className="student-attempt-review__text">{question.questionText}</p>
      <p>{question.pointsAwarded ?? 'Not recorded'} of {question.points ?? '—'} points · {question.isCorrect === true ? 'Correct' : question.isCorrect === false ? 'Incorrect' : 'Correctness not recorded'}</p>
      {!identification && question.options?.length > 0 && <ul className="student-attempt-review__options">{question.options.map((option) => <li key={option.id} className={selected.has(String(option.id)) ? 'student-attempt-review__selected' : ''}>
        <span>{option.text}</span>
        <span className="student-attempt-review__badges">{selected.has(String(option.id)) && <strong>Your choice</strong>}{option.isCorrect && <strong>Correct answer</strong>}</span>
      </li>)}</ul>}
      {(identification || question.answerText != null) && <div><h4>Your answer</h4><p className="student-attempt-review__text">{question.answerText || 'No answer submitted'}</p></div>}
      {!identification && !selected.size && !question.answerText && <p>No answer submitted.</p>}
      {!identification && missingChoices.length > 0 && <p>Your selected {missingChoices.length === 1 ? 'answer is' : 'answers are'} no longer available in the question content shown here.</p>}
      {acceptedAnswers.length > 0 && <div><h4>Accepted answers</h4><ul>{acceptedAnswers.map((answer, answerIndex) => <li key={answerIndex}>{answer}</li>)}</ul></div>}
    </article>
  }) : <p>Question details were not recorded for this attempt.</p>}</section>
}

function CliReview({ criteria = [], commands = [], state }) {
  function deviceName(id) {
    return state?.deviceStates?.[id]?.hostname || state?.devices?.[id]?.hostname
      || (Array.isArray(state?.devices) ? state.devices.find((device) => String(device.id) === String(id))?.hostname : '') || id
  }
  function expectedValue(criterion) {
    if (criterion.expected != null && String(criterion.expected).trim() !== '') return criterion.expected
    return {
      password_encryption: 'Enabled', line_login: 'Enabled', vlan_exists: 'Must exist',
      interface_enabled: 'Enabled (no shutdown)', ip_routing_enabled: 'Enabled',
      ospf_process: 'Must exist', ospf_default_information: 'Enabled', acl_exists: 'Must exist',
      config_saved: 'Running configuration saved',
    }[criterion.type] ?? 'Configured'
  }
  return <>
    <section><h3>Expected configuration</h3>{criteria.length ? criteria.map((criterion, index) => <article className="student-attempt-review__card" key={index}>
      <h4>{label(criterion.type || 'Configuration requirement')}{criterion.target ? `: ${criterion.target}` : ''}</h4>
      {criterion.deviceId && <p>Device: {deviceName(criterion.deviceId)}</p>}
      <div className="student-attempt-review__expected"><strong>Expected</strong><ValueDetails value={expectedValue(criterion)} /></div>
      <p>{criterion.met === true ? 'Requirement met' : criterion.met === false ? 'Requirement not met' : 'Outcome not recorded'} · {criterion.pointsAwarded ?? 'Not recorded'} of {criterion.points ?? '—'} points</p>
    </article>) : <p>Configuration requirements were not recorded.</p>}</section>
    <section><h3>Your commands</h3>{commands.length ? <ol className="student-attempt-review__commands">{[...commands].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)).map((command, index) => <li key={`${command.sequence ?? index}:${index}`}>
      {command.deviceId && <p>Device: {deviceName(command.deviceId)}</p>}
      <code>{command.command}</code>
      {command.accepted != null && <span>{command.accepted ? 'Accepted' : 'Not accepted'}</span>}
      {command.output && <pre>{command.output}</pre>}
    </li>)}</ol> : <p>No commands recorded.</p>}</section>
    <section><h3>Final device state</h3><ValueDetails value={state} /></section>
  </>
}

export default function StudentAttemptReview({ assessmentType, attemptId, title, authorized, onClose, onUnavailable, onRefreshAccess }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useRef(0)
  const loadReview = useCallback(async ({ retain = false } = {}) => {
    const generation = ++request.current
    if (!retain) setData(null)
    setLoading(true)
    setError('')
    try {
      const result = await getStudentAttemptReview(assessmentType, attemptId)
      if (generation === request.current) setData(result)
    } catch {
      if (generation !== request.current) return
      setData(null)
      setError('Review is currently unavailable. Your instructor may have withdrawn access. Try again to check access.')
      onUnavailable(assessmentType, attemptId)
    } finally {
      if (generation === request.current) setLoading(false)
    }
  }, [assessmentType, attemptId, onUnavailable])
  useEffect(() => {
    if (authorized) void loadReview()
    else {
      request.current += 1
      setData(null)
      setLoading(false)
      setError('Review is currently unavailable. Your instructor may have withdrawn access. Try again to check access.')
    }
    return () => { request.current += 1 }
  }, [authorized, loadReview])
  const revalidate = useCallback(() => loadReview({ retain: true }), [loadReview])
  useStudentPageRefresh(revalidate, { enabled: authorized, intervalMs: 30000 })
  async function retry() {
    const generation = request.current
    setLoading(true)
    const next = await onRefreshAccess()
    if (generation !== request.current) return
    // Re-enabling permission triggers a fresh fetch through the effect.
    if (!next.has(`${assessmentType}:${attemptId}`)) setLoading(false)
    else if (authorized) void loadReview()
  }
  function close() {
    request.current += 1
    setData(null)
    onClose()
  }
  return <LibraryItemDialog open title={title || 'Attempt review'} eyebrow="YOUR ATTEMPT REVIEW" onClose={close}>
    <div className="student-attempt-review" aria-busy={loading}>
      {loading && <p role="status">{data ? 'Checking review access...' : 'Loading attempt review...'}</p>}
      {error && <div role="alert"><p>{error}</p><button className="secondary" type="button" disabled={loading} onClick={() => void retry()}>Try again</button></div>}
      {data && authorized && <>
        <div className="student-attempt-review__summary"><strong>{data.attempt?.scorePoints ?? '—'} of {data.attempt?.maximumPoints ?? '—'} points</strong>
          {data.attempt?.percentage != null && <span>{Number(data.attempt.percentage).toFixed(2)}%</span>}
          {data.attempt?.passed != null && <span>{data.attempt.passed ? 'Passed' : 'Not passed'}</span>}
        </div>
        {data.historicalContentNotice && <p className="student-attempt-review__notice">{data.historicalContentNotice}</p>}
        {assessmentType === 'quiz' ? <QuizReview questions={data.questions} /> : <CliReview criteria={data.criteria} commands={data.commands} state={data.state} />}
      </>}
    </div>
  </LibraryItemDialog>
}
