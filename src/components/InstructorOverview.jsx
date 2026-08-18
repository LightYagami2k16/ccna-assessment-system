import {
  Archive,
  ChartNoAxesColumn,
  ClipboardList,
  Library,
  MonitorCheck,
  SquareTerminal,
  Users,
} from 'lucide-react'
import AppIcon from './AppIcon'

const overviewDestinations = [
  {
    id: 'questions',
    icon: Library,
    title: 'Question bank',
    description: 'Manage modules, reusable questions, and content files.',
    action: 'Open question bank',
  },
  {
    id: 'quizzes',
    icon: ClipboardList,
    title: 'Quizzes',
    description: 'Build, publish, and assign knowledge assessments.',
    action: 'Manage quizzes',
  },
  {
    id: 'cli-practicals',
    icon: SquareTerminal,
    title: 'CLI practicals',
    description: 'Create Cisco configuration exams and answer keys.',
    action: 'Manage practicals',
  },
  {
    id: 'assignments',
    icon: Users,
    title: 'Classes & assignments',
    description: 'Manage classes, enrollment, approvals, and access.',
    action: 'Manage classes',
  },
  {
    id: 'exam-controls',
    icon: MonitorCheck,
    title: 'Exam controls',
    description: 'Schedule assessments and monitor active attempts.',
    action: 'Open exam controls',
  },
  {
    id: 'results',
    icon: ChartNoAxesColumn,
    title: 'Student results',
    description: 'Review quiz and CLI outcomes, events, and analytics.',
    action: 'Review results',
  },
  {
    id: 'content-backup',
    icon: Archive,
    title: 'Content backup',
    description: 'Export, validate, restore, and protect course content.',
    action: 'Open content backup',
  },
]

export default function InstructorOverview({ onNavigate }) {
  return (
    <div className="instructor-overview">
      <section className="instructor-overview__intro">
        <div>
          <span className="eyebrow">TEACHING WORKSPACE</span>
          <h2>Manage your CCNA assessments</h2>
          <p>
            Choose one focused area to create content, manage students,
            monitor assessments, or review performance.
          </p>
        </div>
        <span className="instructor-overview__courses">
          <strong>ITN · SRWE · ENSA</strong>
          <small>Shared CCNA content library</small>
        </span>
      </section>

      <section aria-labelledby="instructor-overview-tools">
        <div className="section-heading">
          <div>
            <span className="eyebrow">INSTRUCTOR TOOLS</span>
            <h2 id="instructor-overview-tools">What would you like to manage?</h2>
            <p>Each destination opens as a dedicated workspace page.</p>
          </div>
        </div>

        <div className="instructor-overview__grid">
          {overviewDestinations.map((destination) => (
            <article className="instructor-overview-card" key={destination.id}>
              <span className="instructor-overview-card__icon" aria-hidden="true">
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
