import { useState } from 'react'
import QuizPlayer from './QuizPlayer'
import StudentQuizList from './StudentQuizList'
import StudentRecentResults from './StudentRecentResults'

export default function StudentQuizArea() {
  const [activeAttemptId, setActiveAttemptId] = useState(null)
  const [resultsVersion, setResultsVersion] = useState(0)

  if (activeAttemptId) {
    return (
      <QuizPlayer
        attemptId={activeAttemptId}
        onExit={() => {
          setActiveAttemptId(null)
          setResultsVersion((current) => current + 1)
        }}
      />
    )
  }

  return (
    <div className="student-quiz-area">
      <StudentQuizList onOpenAttempt={setActiveAttemptId} />
      <StudentRecentResults key={resultsVersion} />
    </div>
  )
}
