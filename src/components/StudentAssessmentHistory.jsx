import { useState } from 'react'
import AssessmentTypeIcon from './AssessmentTypeIcon'
import StudentCliHistory from './StudentCliHistory'
import StudentRecentResults from './StudentRecentResults'

const historyViews = [
  { id: 'all', label: 'All results', description: 'Quiz and CLI attempts' },
  { id: 'quiz', label: 'Quizzes', description: 'Knowledge assessments' },
  { id: 'cli', label: 'CLI practicals', description: 'Cisco configuration' },
]

export default function StudentAssessmentHistory({
  onQuizRestored,
  onCliRestored,
}) {
  const [activeView, setActiveView] = useState('all')
  const [refreshVersion, setRefreshVersion] = useState(0)

  return (
    <section className="student-assessment-history">
      <div className="section-heading student-assessment-history__heading">
        <div>
          <span className="eyebrow">MY PERFORMANCE</span>
          <h2>Assessment history</h2>
          <p>
            Review every completed quiz and CLI practical attempt from one
            organized results workspace.
          </p>
        </div>
        <button
          className="secondary"
          type="button"
          onClick={() => setRefreshVersion((current) => current + 1)}
        >
          Refresh history
        </button>
      </div>

      <nav className="student-history-filters" aria-label="History result type">
        {historyViews.map((view) => (
          <button
            className={
              activeView === view.id
                ? 'student-history-filter student-history-filter--active'
                : 'student-history-filter'
            }
            type="button"
            key={view.id}
            aria-pressed={activeView === view.id}
            onClick={() => setActiveView(view.id)}
          >
            <AssessmentTypeIcon
              type={view.id === 'all' ? 'history' : view.id}
            />
            <span>
              <strong>{view.label}</strong>
              <small>{view.description}</small>
            </span>
          </button>
        ))}
      </nav>

      <div className="student-history-content">
        {(activeView === 'all' || activeView === 'quiz') && (
          <StudentRecentResults
            embedded
            refreshVersion={refreshVersion}
            onRestored={onQuizRestored}
          />
        )}

        {(activeView === 'all' || activeView === 'cli') && (
          <StudentCliHistory
            embedded
            refreshVersion={refreshVersion}
            onRestored={onCliRestored}
          />
        )}
      </div>
    </section>
  )
}
