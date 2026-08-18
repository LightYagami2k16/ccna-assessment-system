import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react'
import {
  BookOpenCheck,
  ClipboardList,
  History,
  LayoutDashboard,
  PanelLeftOpen,
  SquareTerminal,
  Users,
  X,
} from 'lucide-react'
import AppIcon from './AppIcon'
import StudentClassEnrollment from './StudentClassEnrollment'
import StudentExamGuide from './StudentExamGuide'
import StudentOverview from './StudentOverview'
import StudentQuizList from './StudentQuizList'
import WorkspaceLoading from './WorkspaceLoading'
import { getStudentActiveAssessmentSession } from '../services/assessmentAttemptService'
import useWorkspaceRoute from '../hooks/useWorkspaceRoute'
import {
  pushWorkspacePath,
  replaceWorkspacePath,
} from '../routing/workspaceRoutes'

const QuizPlayer = lazy(() => import('./QuizPlayer'))
const StudentCliArea = lazy(() => import('./StudentCliArea'))
const StudentAssessmentHistory = lazy(() => import('./StudentAssessmentHistory'))

const studentSections = new Set([
  'overview',
  'available',
  'cli',
  'history',
  'classes',
  'guide',
])

const studentNavigation = [
  {
    id: 'overview',
    icon: LayoutDashboard,
    label: 'Overview',
    description: 'Current priorities and shortcuts',
  },
  {
    id: 'available',
    icon: ClipboardList,
    label: 'Quizzes',
    description: 'Assigned assessments',
  },
  {
    id: 'cli',
    icon: SquareTerminal,
    label: 'CLI practicals',
    description: 'Cisco configuration',
  },
  {
    id: 'history',
    icon: History,
    label: 'Results & history',
    description: 'Quiz and CLI outcomes',
  },
  {
    id: 'classes',
    icon: Users,
    label: 'My classes',
    description: 'Enrollment and memberships',
  },
  {
    id: 'guide',
    icon: BookOpenCheck,
    label: 'Exam guide',
    description: 'Preparation and recovery',
  },
]

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
  const cliAttemptStorageKey = userId
    ? `ccna-student-active-cli-attempt:${userId}`
    : null

  const [activeAttemptId, setActiveAttemptId] = useState(() =>
    readStoredValue(attemptStorageKey),
  )
  const [activeCliAttemptId, setActiveCliAttemptId] = useState(() =>
    readStoredValue(cliAttemptStorageKey),
  )
  const [resultsVersion, setResultsVersion] = useState(0)
  const [enrollmentVersion, setEnrollmentVersion] = useState(0)
  const [activeSession, setActiveSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionMessage, setSessionMessage] = useState('')
  const [navigationOpen, setNavigationOpen] = useState(false)
  const storedSection = readStoredValue(sectionStorageKey)
  const [activeSection, setActiveSection] = useWorkspaceRoute({
    role: 'student',
    initialSection: studentSections.has(storedSection)
      ? storedSection
      : 'overview',
    storageKey: sectionStorageKey,
  })
  const activeNavigationItem =
    studentNavigation.find((item) => item.id === activeSection) ??
    studentNavigation[0]

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
      if (!navigator.onLine && (activeAttemptId || activeCliAttemptId)) {
        setSessionMessage(
          'Offline continuation is active. Your open assessment will synchronize when the connection returns.',
        )
      } else {
        setSessionMessage(error.message)
        setActiveAttemptId(null)
      }
    } finally {
      setSessionLoading(false)
    }
  }, [activeAttemptId, activeCliAttemptId])

  useEffect(() => {
    void loadActiveSession()
  }, [loadActiveSession])

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

  useEffect(() => {
    if (activeAttemptId) {
      replaceWorkspacePath(`/student/quiz/${activeAttemptId}`)
    } else if (activeCliAttemptId) {
      replaceWorkspacePath(`/student/practical/${activeCliAttemptId}`)
    }
  }, [activeAttemptId, activeCliAttemptId])

  function openQuizAttempt(attemptId) {
    setActiveAttemptId(attemptId)
    pushWorkspacePath(`/student/quiz/${attemptId}`)
  }

  function updateCliAttempt(attemptId) {
    setActiveCliAttemptId(attemptId)
    if (attemptId) {
      pushWorkspacePath(`/student/practical/${attemptId}`)
    }
  }

  function selectSection(sectionId) {
    setActiveSection(sectionId)
    setNavigationOpen(false)
  }

  function resumeActiveSession() {
    if (!activeSession) return

    if (activeSession.type === 'quiz') {
      openQuizAttempt(activeSession.attemptId)
      return
    }

    updateCliAttempt(activeSession.attemptId)
  }

  if (sessionLoading && (activeAttemptId || activeCliAttemptId)) {
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
            onActiveAttemptChange={updateCliAttempt}
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
    <div className="student-workspace">
      <header className="workspace-mobile-header">
        <span>
          <small>Student center</small>
          <strong>{activeNavigationItem.label}</strong>
        </span>
        <button
          className="workspace-menu-button"
          type="button"
          aria-expanded={navigationOpen}
          aria-controls="student-navigation"
          onClick={() => setNavigationOpen((current) => !current)}
        >
          <AppIcon
            icon={navigationOpen ? X : PanelLeftOpen}
            aria-hidden="true"
          />
          <span>{navigationOpen ? 'Close menu' : 'Open menu'}</span>
        </button>
      </header>

      <div className="instructor-workspace__layout student-workspace__layout">
        <aside
          id="student-navigation"
          className={
            navigationOpen
              ? 'workspace-sidebar workspace-sidebar--open'
              : 'workspace-sidebar'
          }
        >
          <div className="workspace-sidebar__heading">
            <span className="eyebrow">STUDENT CENTER</span>
            <h2>Learning workspace</h2>
            <p>Open one focused area for assessments, classes, or results.</p>
          </div>

          <nav className="workspace-tabs" aria-label="Student workspace">
            {studentNavigation.map((item) => {
              const isActive = activeSection === item.id

              return (
                <button
                  key={item.id}
                  className={
                    isActive
                      ? 'workspace-tab workspace-tab--active'
                      : 'workspace-tab'
                  }
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => selectSection(item.id)}
                >
                  <span className="workspace-tab__label">
                    <AppIcon icon={item.icon} aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  <small>{item.description}</small>
                </button>
              )
            })}
          </nav>
        </aside>

        <section className="workspace-content student-workspace__content">
          {sessionMessage && (
            <p className="form-message form-message--error" role="alert">
              {sessionMessage}
            </p>
          )}

          <Suspense
            fallback={
              <WorkspaceLoading
                label={`Loading ${activeNavigationItem.label.toLowerCase()}...`}
              />
            }
          >
            {activeSection === 'overview' && (
              <StudentOverview
                activeSession={activeSession}
                formattedExpiration={
                  activeSession
                    ? formatSessionExpiration(activeSession.expiresAt)
                    : ''
                }
                onNavigate={selectSection}
                onResume={resumeActiveSession}
              />
            )}

            {activeSection === 'classes' && (
              <StudentClassEnrollment
                onEnrollmentChanged={() =>
                  setEnrollmentVersion((current) => current + 1)
                }
              />
            )}

            {activeSection === 'guide' && (
              <StudentExamGuide standalone />
            )}

            {activeSection === 'available' && (
              <StudentQuizList
                key={`${enrollmentVersion}-${resultsVersion}`}
                onOpenAttempt={openQuizAttempt}
                onArchived={() => {
                  setResultsVersion((current) => current + 1)
                  setActiveSection('history')
                }}
              />
            )}

            {activeSection === 'history' && (
              <StudentAssessmentHistory
                key={resultsVersion}
                onQuizRestored={() => {
                  setResultsVersion((current) => current + 1)
                  setActiveSection('available')
                }}
                onCliRestored={() => {
                  setResultsVersion((current) => current + 1)
                  setActiveSection('cli')
                }}
              />
            )}

            {activeSection === 'cli' && (
              <StudentCliArea
                userId={userId}
                activeAttemptId={activeCliAttemptId}
                onActiveAttemptChange={updateCliAttempt}
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
    </div>
  )
}
