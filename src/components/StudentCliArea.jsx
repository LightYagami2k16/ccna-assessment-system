import { useCallback, useEffect, useMemo, useState } from 'react'
import CliTerminal from './CliTerminal'
import {
  getAvailableCliLabs,
  startCliAttempt,
} from '../services/cliLabService'

function readStoredAttempt(userId) {
  if (!userId) return null

  try {
    return window.localStorage.getItem(
      `ccna-student-active-cli-attempt:${userId}`,
    )
  } catch {
    return null
  }
}

function clearStoredAttempt(userId) {
  if (!userId) return

  try {
    window.localStorage.removeItem(
      `ccna-student-active-cli-attempt:${userId}`,
    )
  } catch {
    // Navigation still works when browser storage is unavailable.
  }
}

export default function StudentCliArea({
  userId,
  onCompletedAttempt,
}) {
  const [labs, setLabs] = useState([])
  const [activeAttemptId, setActiveAttemptId] = useState(() =>
    readStoredAttempt(userId),
  )
  const [startingId, setStartingId] = useState(null)
  const [message, setMessage] = useState('')

  const loadLabs = useCallback(async () => {
    try {
      setMessage('')
      setLabs(await getAvailableCliLabs())
    } catch (error) {
      setMessage(
        `${error.message} Ask the instructor to confirm that migrations 020 and 038 are installed.`,
      )
    }
  }, [])

  useEffect(() => { void loadLabs() }, [loadLabs])

  const availableLabs = useMemo(
    () =>
      labs.filter(
        (lab) =>
          Boolean(lab.activeAttemptId) ||
          Number(lab.attemptsUsed) < Number(lab.maxAttempts),
      ),
    [labs],
  )

  useEffect(() => {
    if (!userId) return

    try {
      const storageKey = `ccna-student-active-cli-attempt:${userId}`

      if (activeAttemptId) {
        window.localStorage.setItem(storageKey, activeAttemptId)
      } else {
        window.localStorage.removeItem(storageKey)
      }
    } catch {
      // The practical remains usable when browser storage is unavailable.
    }
  }, [activeAttemptId, userId])

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
          onExit={({ completed = false } = {}) => {
            clearStoredAttempt(userId)
            setActiveAttemptId(null)
            void loadLabs()
            if (completed) onCompletedAttempt?.()
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
      {!availableLabs.length ? (
        <div className="empty-state"><h3>No CLI practicals available</h3><p>Assigned practicals with completed or expired attempts are available under Quiz history. A practical remains here while another attempt is available.</p></div>
      ) : (
        <div className="cli-lab-grid">
          {availableLabs.map((lab) => {
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
                  <div>
                    <dt>Devices</dt>
                    <dd>
                      {lab.devices?.length ?? 1}
                      {' · '}
                      {(lab.devices?.length ?? 1) > 1
                        ? 'Topology'
                        : lab.deviceType}
                    </dd>
                  </div>
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
