import { useEffect, useMemo, useState } from 'react'
import { getInstructorBrowserEvents } from '../services/browserEventService'

const eventMetadata = {
  page_hidden: {
    label: 'Exam page hidden',
    description: 'The assessment page moved into the background.',
  },
  page_visible: {
    label: 'Exam page visible',
    description: 'The student returned to the assessment page.',
  },
  window_blur: {
    label: 'Window lost focus',
    description: 'The assessment browser window stopped being active.',
  },
  window_focus: {
    label: 'Window regained focus',
    description: 'The assessment browser window became active again.',
  },
  fullscreen_exited: {
    label: 'Fullscreen exited',
    description: 'The student left browser fullscreen mode.',
  },
  connection_lost: {
    label: 'Connection lost',
    description: 'The browser reported that the device went offline.',
  },
  connection_restored: {
    label: 'Connection restored',
    description: 'The browser reported that internet access returned.',
  },
}

const eventOrder = Object.keys(eventMetadata)

function formatTimestamp(value) {
  if (!value) return 'Timestamp unavailable'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function eventDetails(event) {
  const awayDurationMs = Number(event.details?.awayDurationMs)
  if (Number.isFinite(awayDurationMs) && awayDurationMs > 0) {
    const seconds = awayDurationMs / 1000
    return `Page was hidden for ${seconds.toFixed(seconds < 10 ? 1 : 0)} seconds.`
  }
  return 'No additional browser details were recorded.'
}

export default function BrowserEventReview({
  attemptId,
  attemptType,
  onBack,
}) {
  const [review, setReview] = useState(null)
  const [expandedTypes, setExpandedTypes] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    getInstructorBrowserEvents(attemptId, attemptType)
      .then((data) => {
        if (active) setReview(data)
      })
      .catch((error) => {
        if (active) {
          setMessage(
            `${error.message} Run migration 030_browser_event_reviews.sql if it has not been applied.`,
          )
        }
      })

    return () => {
      active = false
    }
  }, [attemptId, attemptType])

  const groups = useMemo(() => {
    const grouped = new Map()

    for (const event of review?.events ?? []) {
      const type = event.eventType
      if (!grouped.has(type)) grouped.set(type, [])
      grouped.get(type).push(event)
    }

    return [...grouped.entries()]
      .map(([type, events]) => ({
        type,
        events,
        order: eventOrder.indexOf(type),
      }))
      .sort((left, right) => {
        const leftOrder = left.order < 0 ? eventOrder.length : left.order
        const rightOrder = right.order < 0 ? eventOrder.length : right.order
        return leftOrder - rightOrder
      })
  }, [review])

  function toggleType(type) {
    setExpandedTypes((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    )
  }

  if (!review) {
    return (
      <section className="browser-event-review">
        <button className="secondary" type="button" onClick={onBack}>
          Back to student results
        </button>
        <p>{message || 'Loading browser events...'}</p>
      </section>
    )
  }

  const events = review.events ?? []
  const firstEvent = events.at(-1)
  const latestEvent = events[0]

  return (
    <section className="browser-event-review">
      <div className="section-heading">
        <div>
          <span className="eyebrow">BROWSER EVENT REVIEW</span>
          <h2>{review.attempt.studentName}</h2>
          <p>
            {review.attempt.assessmentTitle} · Attempt #
            {review.attempt.attemptNumber} ·{' '}
            {attemptType === 'cli' ? 'CLI practical' : 'Quiz'}
          </p>
        </div>
        <button className="secondary" type="button" onClick={onBack}>
          Back to student results
        </button>
      </div>

      <div className="browser-event-summary">
        <article>
          <span>Total events</span>
          <strong>{events.length}</strong>
        </article>
        <article>
          <span>First recorded event</span>
          <strong>{firstEvent ? formatTimestamp(firstEvent.occurredAt) : 'None'}</strong>
        </article>
        <article>
          <span>Latest recorded event</span>
          <strong>{latestEvent ? formatTimestamp(latestEvent.occurredAt) : 'None'}</strong>
        </article>
      </div>

      {!groups.length ? (
        <div className="empty-state">
          <h3>No browser events recorded</h3>
          <p>This attempt has no integrity-monitoring events.</p>
        </div>
      ) : (
        <div className="browser-event-categories">
          {groups.map((group) => {
            const metadata = eventMetadata[group.type] ?? {
              label: group.type,
              description: 'Browser event recorded during the assessment.',
            }
            const expanded = expandedTypes.includes(group.type)

            return (
              <article className="browser-event-category" key={group.type}>
                <button
                  className="browser-event-category__toggle"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggleType(group.type)}
                >
                  <span>
                    <strong>{metadata.label}</strong>
                    <small>{metadata.description}</small>
                  </span>
                  <span className="browser-event-category__count">
                    {group.events.length}
                  </span>
                  <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                </button>

                {expanded && (
                  <div className="browser-event-timeline">
                    {group.events.map((event) => (
                      <div className="browser-event-timeline__item" key={event.id}>
                        <time dateTime={event.occurredAt}>
                          {formatTimestamp(event.occurredAt)}
                        </time>
                        <p>{eventDetails(event)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
