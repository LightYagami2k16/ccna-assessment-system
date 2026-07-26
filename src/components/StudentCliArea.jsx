import { useCallback, useEffect, useState } from 'react'
import CliTerminal from './CliTerminal'
import {
  getAvailableCliLabs,
  startCliAttempt,
} from '../services/cliLabService'

export default function StudentCliArea() {
  const [labs, setLabs] = useState([])
  const [activeAttemptId, setActiveAttemptId] = useState(null)
  const [startingId, setStartingId] = useState(null)
  const [message, setMessage] = useState('')

  const loadLabs = useCallback(async () => {
    try {
      setMessage('')
      setLabs(await getAvailableCliLabs())
    } catch (error) {
      setMessage(
        `${error.message} Ask the instructor to confirm that Phase 2 migration 020 is installed.`,
      )
    }
  }, [])

  useEffect(() => { void loadLabs() }, [loadLabs])

  async function startLab(lab) {
    setStartingId(lab.id)
    try {
      setActiveAttemptId(
        lab.activeAttemptId || await startCliAttempt(lab.id),
      )
    } catch (error) {
      setMessage(error.message)
    } finally {
      setStartingId(null)
    }
  }

  if (activeAttemptId) {
    return (
      <div className="quiz-focus-mode">
        <CliTerminal
          attemptId={activeAttemptId}
          onExit={() => {
            setActiveAttemptId(null)
            void loadLabs()
          }}
        />
      </div>
    )
  }

  return (
    <section className="student-cli-labs">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PHASE 2 PRACTICALS</span>
          <h2>Available CLI practicals</h2>
          <p>Configure a simulated Cisco device and receive partial-credit grading.</p>
        </div>
        <button className="secondary" type="button" onClick={() => void loadLabs()}>Refresh</button>
      </div>
      {!labs.length ? (
        <div className="empty-state"><h3>No CLI practicals assigned</h3><p>Published practicals assigned to your class will appear here.</p></div>
      ) : (
        <div className="cli-lab-grid">
          {labs.map((lab) => {
            const canStart = Boolean(lab.activeAttemptId) || lab.attemptsUsed < lab.maxAttempts
            return (
              <article className="cli-lab-card" key={lab.id}>
                <header><span className="course-code">{lab.courseCode}</span><span>{lab.moduleCode}</span></header>
                <h3>{lab.title}</h3>
                <p>{lab.description || `${lab.deviceType} configuration practical`}</p>
                <dl>
                  <div><dt>Duration</dt><dd>{lab.durationMinutes} minutes</dd></div>
                  <div><dt>Passing</dt><dd>{lab.passingScore}%</dd></div>
                  <div><dt>Attempts</dt><dd>{lab.attemptsUsed} / {lab.maxAttempts}</dd></div>
                  <div><dt>Device</dt><dd>{lab.deviceType}</dd></div>
                </dl>
                <button className="primary" type="button" disabled={!canStart || startingId === lab.id}
                  onClick={() => void startLab(lab)}>
                  {startingId === lab.id ? 'Opening...' : lab.activeAttemptId ? 'Resume practical' : canStart ? 'Start practical' : 'No attempts remaining'}
                </button>
              </article>
            )
          })}
        </div>
      )}
      {message && <p className="form-message form-message--error">{message}</p>}
    </section>
  )
}
