import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpenCheck, ChevronRight, History, Users } from 'lucide-react'
import AppIcon from './AppIcon'
import StudentAssessmentDetails from './StudentAssessmentDetails'
import LoadingState from './LoadingState'
import RefreshButton from './RefreshButton'
import useStudentOverviewData from '../hooks/useStudentOverviewData'

const overviewDestinations = [
  { id: 'history', icon: History, title: 'Results & history', description: 'Review every completed quiz and CLI attempt.', action: 'View results' },
  { id: 'classes', icon: Users, title: 'My classes', description: 'Join a class and review your enrollment status.', action: 'Manage classes' },
  { id: 'guide', icon: BookOpenCheck, title: 'Exam guide', description: 'Prepare your browser, connection, and device.', action: 'Open guide' },
]

function AssessmentList({ items, scheduled = false }) {
  return <ul className="student-overview-summary__list">
    {items.map((item) => <li key={`${item.assessmentType}:${item.id}`}>
      <strong>{item.title}</strong>
      <small>{[item.assessmentType === 'quiz' ? 'Quiz' : 'CLI practical', item.courseCode, item.moduleCode].filter(Boolean).join(' · ')}</small>
      {scheduled && <span>Opens {new Date(item.availableFrom).toLocaleString()}
        {item.availableUntil && <> · Closes {new Date(item.availableUntil).toLocaleString()}</>}
      </span>}
    </li>)}
  </ul>
}

function AvailabilityCard({ title, items, error, loading, action, onOpen, onDetails }) {
  return <article className="student-overview-summary student-overview-summary--available" aria-label={title}>
    <div className="student-overview-summary__heading"><h3>{title}</h3>
      <div className="student-overview-summary__controls">
        <strong className="student-overview-summary__count" aria-label={`${title} count`}>{items === null ? '�' : items.length}</strong>
        <button className="secondary" type="button" onClick={() => onDetails({ title, items, action, onOpen })} disabled={!items?.length}>Show Details<AppIcon icon={ChevronRight} aria-hidden="true" /></button>
      </div>
    </div>
    {error && <p role="alert">{error}{items !== null && ' Showing the last loaded information.'}</p>}
    {items === null && (loading ? <LoadingState label={`Loading ${title.toLowerCase()}...`} /> : <p>Use Retry to try again.</p>)}
    {items?.length === 0 && <p>No assessments are available to start right now.</p>}
  </article>
}

export default function StudentOverview({ activeSession, formattedExpiration, statusLoading, statusRefreshing, statusError, onRefreshSession, onNavigate, onResume }) {
  const [selectedCategory, setSelectedCategory] = useState(null)
  const { data, errors, loading, load } = useStudentOverviewData()
  const lastAutomaticRefresh = useRef(0)
  const refresh = useCallback(async (options) => {
    await Promise.all([load(options), onRefreshSession(options)])
  }, [load, onRefreshSession])
  useEffect(() => {
    function refreshVisible() {
      if (document.visibilityState !== 'visible' || Date.now() - lastAutomaticRefresh.current < 1000) return
      lastAutomaticRefresh.current = Date.now()
      void refresh({ silent: true })
    }
    const timer = window.setInterval(refreshVisible, 30000)
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [refresh])
  function available(items) {
    return items?.filter((item) => statusError || item.assessmentType !== activeSession?.type || String(item.id) !== String(activeSession?.assessmentId)) ?? null
  }
  return <div className="student-overview">
    <StudentAssessmentDetails category={selectedCategory} onClose={() => setSelectedCategory(null)} />
    <header className="student-workspace-header">
      <div><span className="eyebrow">STUDENT CENTER</span><h2>Student overview</h2><p>Continue active work and review your assigned assessments.</p></div>
      <div className="student-overview__actions">
        {(statusError || Object.values(errors).some(Boolean)) && <RefreshButton label="Retry" loading={loading || statusRefreshing} onClick={() => void refresh()} />}
        <span className="student-workspace-header__track"><strong>CCNA</strong><small>ITN · SRWE · ENSA</small></span>
      </div>
    </header>
    {statusLoading ? <LoadingState label="Checking your active attempt..." />
      : statusError ? <section className="student-overview-summary" role="alert">{statusError}</section>
        : activeSession ? <section className="student-active-session" aria-labelledby="student-active-session-title">
          <div><span className="eyebrow">ACTIVE ASSESSMENT</span><h3 id="student-active-session-title">{activeSession.title}</h3>
            <p>{activeSession.type === 'quiz' ? 'Quiz' : 'CLI practical'} · Ends {formattedExpiration}</p>
            <small>Finish or submit this assessment before starting another one.</small></div>
          <button className="primary" type="button" onClick={onResume} disabled={statusRefreshing}>{activeSession.type === 'quiz' ? 'Resume quiz' : 'Resume CLI practical'}</button>
        </section>
          : <section className="student-overview__ready" aria-label="Assessment status"><strong>You have no assessment attempt in progress.</strong><span>Open an assessment area to see work assigned to you.</span></section>}
    <section aria-labelledby="student-available-assessments">
      <div className="section-heading"><div><span className="eyebrow">READY TO START</span><h2 id="student-available-assessments">Available assessments</h2><p>Work you can start now. In-progress work is shown above.</p></div></div>
      <div className="student-overview-availability">
        <AvailabilityCard title="Available quizzes" items={available(data.quizzes)} error={errors.quizzes} loading={loading} action="View quizzes" onDetails={setSelectedCategory} onOpen={() => onNavigate('available')} />
        <AvailabilityCard title="Available CLI practicals" items={available(data.practicals)} error={errors.practicals} loading={loading} action="View practicals" onDetails={setSelectedCategory} onOpen={() => onNavigate('cli')} />
      </div>
    </section>
    <section className="student-overview-summary" aria-labelledby="student-upcoming-assessments">
      <h2 id="student-upcoming-assessments">Upcoming assessments</h2>
      {errors.upcoming && <p role="alert">{errors.upcoming}{data.upcoming !== null && ' Showing the last loaded information.'}</p>}
      {data.upcoming === null ? (loading ? <LoadingState label="Loading upcoming assessments..." /> : <p>Use Retry to try again.</p>)
        : data.upcoming.length ? <AssessmentList items={data.upcoming} scheduled /> : <p>No upcoming assessments are scheduled for your classes.</p>}
    </section>
    <section aria-labelledby="student-overview-destinations">
      <div className="section-heading"><div><span className="eyebrow">WORKSPACE</span><h2 id="student-overview-destinations">Your workspace</h2></div></div>
      <div className="student-overview__grid">{overviewDestinations.map((destination) => <article className="student-overview-card" key={destination.id}>
        <span className="student-overview-card__icon" aria-hidden="true"><AppIcon icon={destination.icon} /></span>
        <div><h3>{destination.title}</h3><p>{destination.description}</p></div>
        <button className="secondary" type="button" onClick={() => onNavigate(destination.id)}>{destination.action}</button>
      </article>)}</div>
    </section>
  </div>
}
