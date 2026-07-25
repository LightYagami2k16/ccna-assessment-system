import { useState } from 'react'
import QuizPlayer from './QuizPlayer'
import StudentClassEnrollment from './StudentClassEnrollment'
import StudentQuizList from './StudentQuizList'
import StudentRecentResults from './StudentRecentResults'

export default function StudentQuizArea() {
  const [activeAttemptId, setActiveAttemptId] = useState(null)
  const [resultsVersion, setResultsVersion] = useState(0)
  const [enrollmentVersion, setEnrollmentVersion] = useState(0)
  const [activeSection, setActiveSection] = useState('available')

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
      ) : (
        <StudentRecentResults
          key={resultsVersion}
          onRestored={() => {
            setResultsVersion((current) => current + 1)
            setActiveSection('available')
          }}
        />
      )}
    </div>
  )
}
