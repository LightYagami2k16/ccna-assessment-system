import { useState } from 'react'
import QuizPlayer from './QuizPlayer'
import StudentQuizList from './StudentQuizList'

export default function StudentQuizArea() {
  const [activeAttemptId, setActiveAttemptId] = useState(null)

  if (activeAttemptId) {
    return (
      <QuizPlayer
        attemptId={activeAttemptId}
        onExit={() => setActiveAttemptId(null)}
      />
    )
  }

  return <StudentQuizList onOpenAttempt={setActiveAttemptId} />
}
