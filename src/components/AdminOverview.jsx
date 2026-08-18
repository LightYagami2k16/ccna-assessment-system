import {
  Activity,
  ClipboardList,
  ShieldCheck,
  Users,
} from 'lucide-react'
import AppIcon from './AppIcon'

const overviewDestinations = [
  {
    id: 'accounts',
    icon: Users,
    title: 'User accounts',
    description: 'Manage account access and workspace roles.',
    action: 'Manage accounts',
  },
  {
    id: 'security-history',
    icon: ShieldCheck,
    title: 'Security history',
    description: 'Review account and role audit events.',
    action: 'Review security history',
  },
  {
    id: 'system-health',
    icon: Activity,
    title: 'System health',
    description: 'Check runtime errors and backend readiness.',
    action: 'View system health',
  },
  {
    id: 'assessment-tools',
    icon: ClipboardList,
    title: 'Assessment tools',
    description: 'Open instructor content and class management tools.',
    action: 'Open assessment tools',
  },
]

export default function AdminOverview({ onNavigate }) {
  return (
    <div className="instructor-overview admin-overview">
      <section className="instructor-overview__intro">
        <div>
          <span className="eyebrow">PLATFORM WORKSPACE</span>
          <h2>Manage the assessment platform</h2>
          <p>
            Choose one focused area to manage users, review security,
            inspect system health, or open assessment administration.
          </p>
        </div>
        <span className="instructor-overview__courses">
          <strong>Administrator access</strong>
          <small>Accounts, security, health, and assessment tools</small>
        </span>
      </section>

      <section aria-labelledby="admin-overview-tools">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ADMINISTRATOR TOOLS</span>
            <h2 id="admin-overview-tools">What would you like to manage?</h2>
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
