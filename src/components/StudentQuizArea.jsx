import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react'
import StudentClassEnrollment from './StudentClassEnrollment'
import StudentQuizList from './StudentQuizList'
import WorkspaceLoading from './WorkspaceLoading'
import { getStudentActiveAssessmentSession } from '../services/assessmentAttemptService'

const QuizPlayer = lazy(() => import('./QuizPlayer'))
const StudentRecentResults = lazy(() => import('./StudentRecentResults'))
const StudentCliArea = lazy(() => import('./StudentCliArea'))
const StudentCliHistory = lazy(() => import('./StudentCliHistory'))

const studentSections = new Set(['available', 'history', 'cli'])
const studentSectionOrder = ['available', 'cli', 'history']

function readStoredValue(key, fallback = null) {
  if (!key) return fallback

  try {
    return window.localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function storeValue(key, value) {
  if (!key) return

  try {
    if (value) {
      window.localStorage.setItem(key, value)
    } else {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Student assessments continue normally when storage is unavailable.
  }
}

function formatSessionExpiration(value) {
  if (!value) return 'No recorded deadline'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function StudentQuizArea({
  user,
  onExamModeChange = () => {},
}) {
  const userId = user?.id ?? null
  const sectionStorageKey = userId
    ? `ccna-student-active-section:${userId}`
    : null
  const attemptStorageKey = userId
    ? `ccna-student-active-quiz-attempt:${userId}`
    : null

  const [activeAttemptId, setActiveAttemptId] = useState(() =>
    readStoredValue(attemptStorageKey),
  )
  const [activeCliAttemptId, setActiveCliAttemptId] = useState(null)
  const [resultsVersion, setResultsVersion] = useState(0)
  const [enrollmentVersion, setEnrollmentVersion] = useState(0)
  const [activeSession, setActiveSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionMessage, setSessionMessage] = useState('')
  const [activeSection, setActiveSection] = useState(() => {
    const storedSection = readStoredValue(sectionStorageKey, 'available')
    return studentSections.has(storedSection) ? storedSection : 'available'
  })

  const loadActiveSession = useCallback(async () => {
    try {
      setSessionMessage('')
      const session = await getStudentActiveAssessmentSession()
      setActiveSession(session)
      setActiveAttemptId((currentAttemptId) => {
        if (!currentAttemptId) return null

        return session?.type === 'quiz' &&
          session.attemptId === currentAttemptId
          ? currentAttemptId
          : null
      })
    } catch (error) {
      setSessionMessage(error.message)
      setActiveAttemptId(null)
    } finally {
      setSessionLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadActiveSession()
  }, [loadActiveSession])

  useEffect(() => {
    storeValue(sectionStorageKey, activeSection)
  }, [activeSection, sectionStorageKey])

  useEffect(() => {
    storeValue(attemptStorageKey, activeAttemptId)
  }, [activeAttemptId, attemptStorageKey])

  const examModeActive = Boolean(
    activeAttemptId || activeCliAttemptId,
  )

  useEffect(() => {
    onExamModeChange(examModeActive)

    return () => onExamModeChange(false)
  }, [examModeActive, onExamModeChange])

  function handleTabKeyDown(event) {
    const currentIndex = studentSectionOrder.indexOf(activeSection)
    let nextIndex = currentIndex

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % studentSectionOrder.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex =
        (currentIndex - 1 + studentSectionOrder.length) %
        studentSectionOrder.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = studentSectionOrder.length - 1
    } else {
      return
    }

    event.preventDefault()
    const nextSection = studentSectionOrder[nextIndex]
    setActiveSection(nextSection)
    window.requestAnimationFrame(() => {
      document.getElementById(`student-tab-${nextSection}`)?.focus()
    })
  }

  function resumeActiveSession() {
    if (!activeSession) return

    if (activeSession.type === 'quiz') {
      setActiveAttemptId(activeSession.attemptId)
      return
    }

    setActiveCliAttemptId(activeSession.attemptId)
    setActiveSection('cli')
  }

  if (sessionLoading && activeAttemptId) {
    return <WorkspaceLoading label="Validating saved assessment..." />
  }

  if (activeAttemptId) {
    return (
      <div className="quiz-focus-mode">
        <Suspense
          fallback={<WorkspaceLoading label="Loading quiz attempt..." />}
        >
          <QuizPlayer
            attemptId={activeAttemptId}
            onSubmitted={() => {
              storeValue(attemptStorageKey, null)
              storeValue(sectionStorageKey, 'history')
            }}
            onExit={() => {
              setActiveAttemptId(null)
              setResultsVersion((current) => current + 1)
              setActiveSection('history')
              void loadActiveSession()
            }}
          />
        </Suspense>
      </div>
    )
  }

  if (activeCliAttemptId) {
    return (
      <div className="quiz-focus-mode">
        <Suspense
          fallback={<WorkspaceLoading label="Loading CLI practical..." />}
        >
          <StudentCliArea
            userId={userId}
            activeAttemptId={activeCliAttemptId}
            onActiveAttemptChange={setActiveCliAttemptId}
            onActiveSessionChanged={loadActiveSession}
            onAttemptSubmitted={() => {
              storeValue(sectionStorageKey, 'history')
            }}
            onCompletedAttempt={() => {
              setResultsVersion((current) => current + 1)
              setActiveSection('history')
              void loadActiveSession()
            }}
            onArchived={() => {
              setResultsVersion((current) => current + 1)
              setActiveSection('history')
            }}
          />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="student-quiz-area">
      <header className="student-workspace-header">
        <div>
          <span className="eyebrow">STUDENT WORKSPACE</span>
          <h2>My assessments</h2>
          <p>
            Join a class, complete assigned assessments, and review your
            results from one workspace.
          </p>
        </div>
        <span className="student-workspace-header__track">
          <strong>CCNA</strong>
          <small>ITN · SRWE · ENSA</small>
        </span>
      </header>

      <StudentClassEnrollment
        onEnrollmentChanged={() =>
          setEnrollmentVersion((current) => current + 1)
        }
      />

      {activeSession && (
        <section
          className="student-active-session"
          aria-labelledby="student-active-session-title"
        >
          <div>
            <span className="eyebrow">ACTIVE ASSESSMENT</span>
            <h3 id="student-active-session-title">
              {activeSession.title}
            </h3>
            <p>
              {activeSession.type === 'quiz'
                ? 'Quiz'
                : 'CLI practical'}
              {' · '}
              Ends {formatSessionExpiration(activeSession.expiresAt)}
            </p>
            <small>
              Finish or submit this assessment before starting another one.
            </small>
          </div>
          <button
            className="primary"
            type="button"
            onClick={resumeActiveSession}
          >
            {activeSession.type === 'quiz'
              ? 'Resume quiz'
              : 'Resume CLI practical'}
          </button>
        </section>
      )}

      {sessionMessage && (
        <p className="form-message form-message--error" role="alert">
          {sessionMessage}
        </p>
      )}

      <nav
        className="student-assessment-tabs"
        aria-label="Student assessments"
        role="tablist"
        onKeyDown={handleTabKeyDown}
      >
        <button
          className={
            activeSection === 'available'
              ? 'student-assessment-tab student-assessment-tab--active'
              : 'student-assessment-tab'
          }
          type="button"
          id="student-tab-available"
          role="tab"
          aria-selected={activeSection === 'available'}
          aria-controls="student-panel-available"
          tabIndex={activeSection === 'available' ? 0 : -1}
          onClick={() => setActiveSection('available')}
        >
          <strong>Available</strong>
          <small>Assigned quizzes</small>
        </button>
        <button
          className={
            activeSection === 'cli'
              ? 'student-assessment-tab student-assessment-tab--active'
              : 'student-assessment-tab'
          }
          type="button"
          id="student-tab-cli"
          role="tab"
          aria-selected={activeSection === 'cli'}
          aria-controls="student-panel-cli"
          tabIndex={activeSection === 'cli' ? 0 : -1}
          onClick={() => setActiveSection('cli')}
        >
          <strong>CLI practicals</strong>
          <small>Cisco configuration</small>
        </button>
        <button
          className={
            activeSection === 'history'
              ? 'student-assessment-tab student-assessment-tab--active'
              : 'student-assessment-tab'
          }
          type="button"
          id="student-tab-history"
          role="tab"
          aria-selected={activeSection === 'history'}
          aria-controls="student-panel-history"
          tabIndex={activeSection === 'history' ? 0 : -1}
          onClick={() => setActiveSection('history')}
        >
          <strong>History</strong>
          <small>Quiz and CLI results</small>
        </button>
      </nav>

      <section
        className="student-assessment-panel"
        id={`student-panel-${activeSection}`}
        role="tabpanel"
        aria-labelledby={`student-tab-${activeSection}`}
        tabIndex="-1"
      >
        <Suspense
          fallback={<WorkspaceLoading label="Loading assessments..." />}
        >
          {activeSection === 'available' ? (
            <StudentQuizList
              key={`${enrollmentVersion}-${resultsVersion}`}
              onOpenAttempt={setActiveAttemptId}
              onArchived={() => {
                setResultsVersion((current) => current + 1)
                setActiveSection('history')
              }}
            />
          ) : activeSection === 'history' ? (
            <>
              <StudentRecentResults
                key={resultsVersion}
                onRestored={() => {
                  setResultsVersion((current) => current + 1)
                  setActiveSection('available')
                }}
              />
              <StudentCliHistory
                key={`cli-${resultsVersion}`}
                onRestored={() => {
                  setResultsVersion((current) => current + 1)
                  setActiveSection('cli')
                }}
              />
            </>
          ) : (
            <StudentCliArea
              userId={userId}
              activeAttemptId={activeCliAttemptId}
              onActiveAttemptChange={setActiveCliAttemptId}
              resumeAttemptId={
                activeSession?.type === 'cli'
                  ? activeSession.attemptId
                  : null
              }
              onActiveSessionChanged={loadActiveSession}
              onAttemptSubmitted={() => {
                storeValue(sectionStorageKey, 'history')
              }}
              onCompletedAttempt={() => {
                setResultsVersion((current) => current + 1)
                setActiveSection('history')
                void loadActiveSession()
              }}
              onArchived={() => {
                setResultsVersion((current) => current + 1)
                setActiveSection('history')
              }}
            />
          )}
        </Suspense>
      </section>
    </div>
  )
}
