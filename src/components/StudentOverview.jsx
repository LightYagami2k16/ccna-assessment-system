import {
  BookOpenCheck,
  ClipboardList,
  History,
  SquareTerminal,
  Users,
} from 'lucide-react'
import AppIcon from './AppIcon'

const overviewDestinations = [
  {
    id: 'available',
    icon: ClipboardList,
    title: 'Quizzes',
    description: 'Start or resume quizzes assigned to your classes.',
    action: 'View quizzes',
  },
  {
    id: 'cli',
    icon: SquareTerminal,
    title: 'CLI practicals',
    description: 'Configure simulated Cisco devices and topologies.',
    action: 'View practicals',
  },
  {
    id: 'history',
    icon: History,
    title: 'Results & history',
    description: 'Review every completed quiz and CLI attempt.',
    action: 'View results',
  },
  {
    id: 'classes',
    icon: Users,
    title: 'My classes',
    description: 'Join a class and review your enrollment status.',
    action: 'Manage classes',
  },
  {
    id: 'guide',
    icon: BookOpenCheck,
    title: 'Exam guide',
    description: 'Prepare your browser, connection, and device.',
    action: 'Open guide',
  },
]

export default function StudentOverview({
  activeSession,
  formattedExpiration,
  onNavigate,
  onResume,
}) {
  return (
    <div className="student-overview">
      <header className="student-workspace-header">
        <div>
          <span className="eyebrow">STUDENT CENTER</span>
          <h2>Student overview</h2>
          <p>
            Continue active work or open the assessment area you need.
          </p>
        </div>
        <span className="student-workspace-header__track">
          <strong>CCNA</strong>
          <small>ITN · SRWE · ENSA</small>
        </span>
      </header>

      {activeSession ? (
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
              {activeSession.type === 'quiz' ? 'Quiz' : 'CLI practical'}
              {' · '}
              Ends {formattedExpiration}
            </p>
            <small>
              Finish or submit this assessment before starting another one.
            </small>
          </div>
          <button className="primary" type="button" onClick={onResume}>
            {activeSession.type === 'quiz'
              ? 'Resume quiz'
              : 'Resume CLI practical'}
          </button>
        </section>
      ) : (
        <section className="student-overview__ready" aria-label="Assessment status">
          <strong>No assessment is currently open.</strong>
          <span>You can safely start an available quiz or CLI practical.</span>
        </section>
      )}

      <section aria-labelledby="student-overview-destinations">
        <div className="section-heading">
          <div>
            <span className="eyebrow">WORKSPACE</span>
            <h2 id="student-overview-destinations">What would you like to do?</h2>
            <p>Choose one area to keep your workspace focused.</p>
          </div>
        </div>

        <div className="student-overview__grid">
          {overviewDestinations.map((destination) => (
            <article className="student-overview-card" key={destination.id}>
              <span className="student-overview-card__icon" aria-hidden="true">
                <AppIcon icon={destination.icon} />
              </span>
              <div>
                <h3>{destination.title}</h3>
                <p>{destination.description}</p>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={() => onNavigate(destination.id)}
              >
                {destination.action}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
