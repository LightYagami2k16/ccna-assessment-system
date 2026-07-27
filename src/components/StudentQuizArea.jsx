import { useEffect, useState } from 'react'
import QuizPlayer from './QuizPlayer'
import StudentClassEnrollment from './StudentClassEnrollment'
import StudentQuizList from './StudentQuizList'
import StudentRecentResults from './StudentRecentResults'
import StudentCliArea from './StudentCliArea'
import StudentCliHistory from './StudentCliHistory'

const studentSections = new Set(['available', 'history', 'cli'])

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

  if (activeAttemptId) {
    return (
      <div className="quiz-focus-mode">
        <QuizPlayer
          attemptId={activeAttemptId}
          onExit={() => {
            setActiveAttemptId(null)
            setResultsVersion((current) => current + 1)
            setActiveSection('history')
          }}
        />
      </div>
    )
  }

  return (
    <div className="student-quiz-area">
      <StudentClassEnrollment
        onEnrollmentChanged={() =>
          setEnrollmentVersion((current) => current + 1)
        }
      />

      <nav
        className="student-assessment-tabs"
        aria-label="Student assessments"
      >
        <button
          className={
            activeSection === 'available'
              ? 'student-assessment-tab student-assessment-tab--active'
              : 'student-assessment-tab'
          }
          type="button"
          onClick={() => setActiveSection('available')}
        >
          Available quizzes
        </button>
        <button
          className={
            activeSection === 'history'
              ? 'student-assessment-tab student-assessment-tab--active'
              : 'student-assessment-tab'
          }
          type="button"
          onClick={() => setActiveSection('history')}
        >
          Quiz history
        </button>
        <button
          className={
            activeSection === 'cli'
              ? 'student-assessment-tab student-assessment-tab--active'
              : 'student-assessment-tab'
          }
          type="button"
          onClick={() => setActiveSection('cli')}
        >
          CLI practicals
        </button>
      </nav>

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
        <StudentCliArea userId={userId} />
      )}
    </div>
  )
}
