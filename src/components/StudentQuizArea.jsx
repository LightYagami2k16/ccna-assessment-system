import { lazy, Suspense, useEffect, useState } from 'react'
import StudentClassEnrollment from './StudentClassEnrollment'
import StudentQuizList from './StudentQuizList'
import WorkspaceLoading from './WorkspaceLoading'

const QuizPlayer = lazy(() => import('./QuizPlayer'))
const StudentRecentResults = lazy(() => import('./StudentRecentResults'))
const StudentCliArea = lazy(() => import('./StudentCliArea'))
const StudentCliHistory = lazy(() => import('./StudentCliHistory'))

const studentSections = new Set(['available', 'history', 'cli'])
const studentSectionOrder = ['available', 'history', 'cli']

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

export default function StudentQuizArea({ user }) {
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
  const [resultsVersion, setResultsVersion] = useState(0)
  const [enrollmentVersion, setEnrollmentVersion] = useState(0)
  const [activeSection, setActiveSection] = useState(() => {
    const storedSection = readStoredValue(sectionStorageKey, 'available')
    return studentSections.has(storedSection) ? storedSection : 'available'
  })

  useEffect(() => {
    storeValue(sectionStorageKey, activeSection)
  }, [activeSection, sectionStorageKey])

  useEffect(() => {
    storeValue(attemptStorageKey, activeAttemptId)
  }, [activeAttemptId, attemptStorageKey])

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

  if (activeAttemptId) {
    return (
      <div className="quiz-focus-mode">
        <Suspense
          fallback={<WorkspaceLoading label="Loading quiz attempt..." />}
        >
          <QuizPlayer
            attemptId={activeAttemptId}
            onExit={() => {
              setActiveAttemptId(null)
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
              <StudentCliHistory key={`cli-${resultsVersion}`} />
            </>
          ) : (
            <StudentCliArea
              userId={userId}
              onCompletedAttempt={() => {
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
