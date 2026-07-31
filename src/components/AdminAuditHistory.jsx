import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAdminAuditEvents } from '../services/adminService'

const eventLabels = {
  role_changed: 'Role changes',
  invite_sent: 'Invitations',
  password_reset_sent: 'Password resets',
  instructor_password_reset: 'Instructor password resets',
  account_suspended: 'Suspensions',
  account_reactivated: 'Reactivations',
  account_deleted: 'Deleted accounts',
}

const previewEvents = [
  {
    id: 'preview-role',
    type: 'role_changed',
    targetUserId: 'uat-instructor',
    targetName: 'CCNA Instructor',
    targetEmail: 'instructor@example.test',
    actorName: 'UAT Administrator',
    actorEmail: 'admin@example.test',
    details: {
      previousRole: 'student',
      newRole: 'instructor',
    },
    occurredAt: new Date().toISOString(),
  },
  {
    id: 'preview-invite',
    type: 'invite_sent',
    targetUserId: 'uat-student',
    targetName: 'CCNA Student',
    targetEmail: 'student@example.test',
    actorName: 'UAT Administrator',
    actorEmail: 'admin@example.test',
    details: { role: 'student' },
    occurredAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'preview-password-reset',
    type: 'password_reset_sent',
    targetUserId: 'uat-instructor',
    targetName: 'CCNA Instructor',
    targetEmail: 'instructor@example.test',
    actorName: 'UAT Administrator',
    actorEmail: 'admin@example.test',
    details: {},
    occurredAt: new Date(Date.now() - 7200000).toISOString(),
  },
]

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function eventDescription(event) {
  if (event.type === 'role_changed') {
    return `${event.details.previousRole} → ${event.details.newRole}`
  }

  if (event.type === 'invite_sent') {
    return `Invitation sent as ${event.details.role ?? 'student'}`
  }

  if (event.type === 'password_reset_sent') {
    return 'Password reset instructions sent'
  }

  if (event.type === 'instructor_password_reset') {
    return 'Temporary password created by the class instructor'
  }

  if (event.type === 'account_suspended') {
    return 'Account access suspended'
  }

  if (event.type === 'account_reactivated') {
    return 'Account access restored'
  }

  return `Account permanently deleted (${event.details.role ?? 'unknown role'})`
}

export default function AdminAuditHistory({
  previewMode = false,
}) {
  const [events, setEvents] = useState([])
  const [expandedGroups, setExpandedGroups] = useState({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')
      const nextEvents = previewMode
        ? previewEvents
        : await getAdminAuditEvents()
      setEvents(nextEvents)
    } catch (error) {
      setMessage(
        error?.message ?? 'Unable to load administrator history.',
      )
    } finally {
      setLoading(false)
    }
  }, [previewMode])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const groupedEvents = useMemo(
    () =>
      Object.entries(eventLabels).map(([type, label]) => ({
        type,
        label,
        events: events.filter((event) => event.type === type),
      })),
    [events],
  )

  return (
    <section className="admin-audit-panel">
      <header className="section-heading">
        <div>
          <span className="eyebrow">SECURITY AUDIT</span>
          <h2>Administrator history</h2>
          <p>
            Review role changes, invitations, password resets,
            suspensions, reactivations, and permanent account
            deletions with their exact timestamps.
          </p>
        </div>

        <button
          className="secondary"
          type="button"
          disabled={loading}
          onClick={() => void loadEvents()}
        >
          {loading ? 'Refreshing...' : 'Refresh history'}
        </button>
      </header>

      {message && (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      )}

      {loading ? (
        <div className="admin-users-empty">
          <strong>Loading security history...</strong>
        </div>
      ) : events.length === 0 ? (
        <div className="admin-users-empty">
          <strong>No administrator events yet</strong>
          <span>Account and role changes will appear here.</span>
        </div>
      ) : (
        <div className="admin-audit-groups">
          {groupedEvents.map((group) => {
            const expanded = Boolean(expandedGroups[group.type])

            return (
              <section className="admin-audit-group" key={group.type}>
                <button
                  className="admin-audit-group__toggle"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedGroups((current) => ({
                      ...current,
                      [group.type]: !expanded,
                    }))
                  }
                >
                  <span>
                    <strong>{group.label}</strong>
                    <small>
                      {group.events.length}{' '}
                      {group.events.length === 1 ? 'event' : 'events'}
                    </small>
                  </span>
                  <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                </button>

                {expanded && (
                  <div className="admin-audit-list">
                    {group.events.length === 0 ? (
                      <p>No events in this category.</p>
                    ) : (
                      group.events.map((event) => (
                        <article key={event.id}>
                          <div>
                            <strong>
                              {event.targetName || event.targetEmail}
                            </strong>
                            <small>{event.targetEmail}</small>
                          </div>
                          <div>
                            <strong>{eventDescription(event)}</strong>
                            <small>
                              By {event.actorName || event.actorEmail}
                            </small>
                          </div>
                          <time dateTime={event.occurredAt}>
                            {formatDate(event.occurredAt)}
                          </time>
                        </article>
                      ))
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
