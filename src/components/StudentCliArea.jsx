import { useCallback, useEffect, useMemo, useState } from 'react'
import AssessmentTypeIcon from './AssessmentTypeIcon'
import CliTerminal from './CliTerminal'
import WorkspaceLoading from './WorkspaceLoading'
import {
  getAvailableCliLabs,
  getStudentCliArchiveStatuses,
  setStudentCliLabArchived,
  startCliAttempt,
} from '../services/cliLabService'

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
  activeAttemptId: controlledActiveAttemptId,
  onActiveAttemptChange,
  resumeAttemptId = null,
  onActiveSessionChanged,
  onAttemptSubmitted,
  onCompletedAttempt,
  onArchived,
}) {
  const [labs, setLabs] = useState([])
  const [archiveStatuses, setArchiveStatuses] = useState([])
  const [internalActiveAttemptId, setInternalActiveAttemptId] =
    useState(null)
  const [startingId, setStartingId] = useState(null)
  const [archivingId, setArchivingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const controlled = controlledActiveAttemptId !== undefined
  const activeAttemptId = controlled
    ? controlledActiveAttemptId
    : internalActiveAttemptId

  const setActiveAttemptId = useCallback(
    (attemptId) => {
      if (!controlled) setInternalActiveAttemptId(attemptId)
      onActiveAttemptChange?.(attemptId)
    },
    [controlled, onActiveAttemptChange],
  )

  const loadLabs = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      const [availableData, archiveData] = await Promise.all([
        getAvailableCliLabs(),
        getStudentCliArchiveStatuses(),
      ])
      setLabs(availableData)
      setArchiveStatuses(archiveData)
    } catch (error) {
      setMessage(
        `${error.message} Ask the instructor to confirm that migrations 020, 038, and 051 are installed.`,
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadLabs() }, [loadLabs])

  useEffect(() => {
    if (resumeAttemptId) {
      setActiveAttemptId(resumeAttemptId)
    }
  }, [resumeAttemptId, setActiveAttemptId])

  const availableLabs = useMemo(
    () =>
      labs.filter(
        (lab) => {
          const status = archiveStatuses.find(
            (item) => String(item.labId) === String(lab.id),
          )
          if (lab.activeAttemptId) return true
          if (status?.archived) return false
          return Number(lab.attemptsUsed) < Number(lab.maxAttempts)
        },
      ),
    [archiveStatuses, labs],
  )

  const archiveStatusByLab = useMemo(
    () => new Map(
      archiveStatuses.map((item) => [String(item.labId), item]),
    ),
    [archiveStatuses],
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
      const attemptId =
        lab.activeAttemptId || await startCliAttempt(lab.id)
      setActiveAttemptId(attemptId)
      onActiveSessionChanged?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setStartingId(null)
    }
  }

  async function archiveLab(labId) {
    setArchivingId(labId)
    try {
      setMessage('')
      await setStudentCliLabArchived(labId, true)
      await loadLabs()
      onArchived?.()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setArchivingId(null)
    }
  }

  if (activeAttemptId) {
    return (
      <div className="quiz-focus-mode">
        <CliTerminal
          attemptId={activeAttemptId}
          onSubmitted={() => {
            clearStoredAttempt(userId)
            onActiveSessionChanged?.()
            onAttemptSubmitted?.()
          }}
          onExit={({ completed = false } = {}) => {
            clearStoredAttempt(userId)
            setActiveAttemptId(null)
            void loadLabs()
            onActiveSessionChanged?.()
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
          <span className="eyebrow">PRACTICALS</span>
          <h2>Available CLI practicals</h2>
          <p>Configure a simulated Cisco device and receive partial-credit grading.</p>
        </div>
        <button className="secondary" type="button" disabled={loading} onClick={() => void loadLabs()}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {message && (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      )}
      {loading ? (
        <div className="student-assessment-loading">
          <WorkspaceLoading label="Loading CLI practicals..." />
        </div>
      ) : !availableLabs.length ? (
        <div className="empty-state student-assessment-empty">
          <AssessmentTypeIcon type="cli" />
          <h3>No CLI practicals available</h3>
          <p>Assigned practicals with completed or expired attempts are available under Quiz history. A practical remains here while another attempt is available.</p>
        </div>
      ) : (
        <div className="cli-lab-grid">
          {availableLabs.map((lab) => {
            const canStart = Boolean(lab.activeAttemptId) || lab.attemptsUsed < lab.maxAttempts
            const status = archiveStatusByLab.get(String(lab.id))
            const canArchive = Boolean(status?.hasCompletedAttempt)
              && !lab.activeAttemptId
              && Number(status?.attemptsRemaining) > 0
            return (
              <article className="cli-lab-card" key={lab.id}>
                <header className="student-assessment-card__header">
                  <AssessmentTypeIcon type="cli" />
                  <div className="student-assessment-card__identity">
                    <div className="student-assessment-card__kicker">
                      <span className="course-code">{lab.courseCode}</span>
                      <span className="student-assessment-card__module">
                        {lab.moduleCode}
                      </span>
                    </div>
                    <h3>{lab.title}</h3>
                  </div>
                </header>
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
                <div className="cli-lab-card__student-actions">
                  <button className="primary" type="button" disabled={!canStart || startingId === lab.id || archivingId === lab.id}
                    onClick={() => void startLab(lab)}>
                    {startingId === lab.id ? 'Opening...' : lab.activeAttemptId ? 'Resume practical' : canStart ? 'Start practical' : 'No attempts remaining'}
                  </button>
                  {canArchive && (
                    <button className="secondary" type="button" disabled={archivingId === lab.id || startingId === lab.id}
                      onClick={() => void archiveLab(lab.id)}>
                      {archivingId === lab.id ? 'Archiving...' : 'Archive to history'}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
