import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { getAdminAuditEvents } from '../services/adminService'
import LoadingState from './LoadingState'
import TailwindEmptyState from './TailwindEmptyState'
import { FilterBar } from './LayoutPrimitives'

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

function escapeCsv(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function exportAuditCsv(events) {
  const headers = [
    'Timestamp', 'Event category', 'Target name', 'Target email',
    'Description', 'Performed by', 'Actor email',
  ]
  const rows = events.map((event) => [
    event.occurredAt,
    eventLabels[event.type] ?? event.type,
    event.targetName,
    event.targetEmail,
    eventDescription(event),
    event.actorName,
    event.actorEmail,
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n')
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `ccna-security-audit-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function AdminAuditHistory({
  previewMode = false,
}) {
  const [events, setEvents] = useState([])
  const [expandedGroups, setExpandedGroups] = useState({})
  const [eventFilter, setEventFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [search, setSearch] = useState('')
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

  const filteredEvents = useMemo(() => {
    const searchTerm = search.trim().toLowerCase()
    const cutoff = new Date()
    if (dateFilter !== 'all') cutoff.setDate(cutoff.getDate() - Number(dateFilter))

    return events.filter((event) => {
      const matchesType = eventFilter === 'all' || event.type === eventFilter
      const matchesDate = dateFilter === 'all'
        || new Date(event.occurredAt) >= cutoff
      const matchesSearch = !searchTerm || [
        event.targetName,
        event.targetEmail,
        event.actorName,
        event.actorEmail,
        eventDescription(event),
      ].some((value) => String(value || '').toLowerCase().includes(searchTerm))
      return matchesType && matchesDate && matchesSearch
    })
  }, [dateFilter, eventFilter, events, search])

  const metrics = useMemo(() => {
    const lastDay = Date.now() - 24 * 60 * 60 * 1000
    return {
      total: events.length,
      recent: events.filter(
        (event) => new Date(event.occurredAt).getTime() >= lastDay,
      ).length,
      accounts: new Set(
        events.map((event) => event.targetUserId || event.targetEmail).filter(Boolean),
      ).size,
      accessChanges: events.filter((event) => [
        'role_changed', 'account_suspended', 'account_reactivated',
        'account_deleted',
      ].includes(event.type)).length,
    }
  }, [events])

  const groupedEvents = useMemo(
    () =>
      Object.entries(eventLabels).map(([type, label]) => ({
        type,
        label,
        events: filteredEvents.filter((event) => event.type === type),
      })).filter((group) => eventFilter === 'all' || group.type === eventFilter),
    [eventFilter, filteredEvents],
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

        <div className="admin-audit-panel__actions">
          <button className="secondary" type="button"
            disabled={!filteredEvents.length}
            onClick={() => exportAuditCsv(filteredEvents)}>
            Export visible events
          </button>
          <button className="secondary" type="button" disabled={loading}
            onClick={() => void loadEvents()}>
            {loading ? 'Refreshing...' : 'Refresh history'}
          </button>
        </div>
      </header>

      <div className="admin-audit-metrics" aria-label="Security audit summary">
        <article><span>Total events</span><strong>{metrics.total}</strong></article>
        <article><span>Last 24 hours</span><strong>{metrics.recent}</strong></article>
        <article><span>Affected accounts</span><strong>{metrics.accounts}</strong></article>
        <article><span>Access changes</span><strong>{metrics.accessChanges}</strong></article>
      </div>

      <FilterBar className="admin-audit-filters" aria-label="Security history filters">
        <label>
          Event category
          <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)}>
            <option value="all">All categories</option>
            {Object.entries(eventLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Date range
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
            <option value="all">All available events</option>
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </label>
        <label>
          Search accounts or administrators
          <input value={search} placeholder="Name, email, or event details"
            onChange={(event) => setSearch(event.target.value)} />
        </label>
      </FilterBar>

      {message && (
        <p className="form-message form-message--error" role="alert">
          {message}
        </p>
      )}

      {loading ? (
        <LoadingState label="Loading security history..." />
      ) : events.length === 0 ? (
        <TailwindEmptyState
          icon={ShieldCheck}
          title="No administrator events yet"
          description="Account and role changes will appear here."
        />
      ) : filteredEvents.length === 0 ? (
        <TailwindEmptyState
          icon={ShieldCheck}
          title="No matching security events"
          description="Adjust the category, date range, or search text."
        />
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
