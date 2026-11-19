import { lazy, Suspense, useState } from 'react'
import { PanelLeftOpen, X } from 'lucide-react'
import AppIcon from './AppIcon'
import WorkspaceLoading from './WorkspaceLoading'
import useWorkspaceRoute from '../hooks/useWorkspaceRoute'
import { instructorNavigation } from '../routing/assessmentNavigation'
import AssessmentWorkspaceContent from './AssessmentWorkspaceContent'
import WorkspaceBreadcrumbs from './WorkspaceBreadcrumbs'

const InstructorOverview = lazy(() => import('./InstructorOverview'))

const instructorSections = new Set([
  'competitions',
  'overview',
  'questions',
  'quizzes',
  'cli-practicals',
  'assignments',
  'exam-controls',
  'results',
  'content-backup',
])


function getStoredSection(userId) {
  if (!userId) return 'overview'

  try {
    const storedSection = window.localStorage.getItem(
      `ccna-instructor-active-section:${userId}`,
    )

    return instructorSections.has(storedSection)
      ? storedSection
      : 'overview'
  } catch {
    return 'overview'
  }
}

export default function InstructorWorkspace({
  user,
}) {
  const [activeSection, setActiveSection] = useWorkspaceRoute({
    role: 'instructor',
    initialSection: getStoredSection(user?.id),
    storageKey: user?.id
      ? `ccna-instructor-active-section:${user.id}`
      : null,
  })
  const [navigationOpen, setNavigationOpen] = useState(false)
  const availableNavigation = instructorNavigation
  const activeNavigationItem =
    availableNavigation.find((item) => item.id === activeSection) ??
    availableNavigation[0]

  function selectSection(sectionId) {
    setActiveSection(sectionId)
    setNavigationOpen(false)
  }

  return (
    <div className="instructor-workspace">
      <header className="workspace-mobile-header">
        <span>
          <small>Instructor tools</small>
          <strong>
            {
              availableNavigation.find(
                (item) => item.id === activeSection,
              )?.label
            }
          </strong>
        </span>

        <button
          className="workspace-menu-button"
          type="button"
          aria-expanded={navigationOpen}
          aria-controls="instructor-navigation"
          onClick={() => setNavigationOpen((current) => !current)}
        >
          <AppIcon
            icon={navigationOpen ? X : PanelLeftOpen}
            aria-hidden="true"
          />
          <span>{navigationOpen ? 'Close menu' : 'Open menu'}</span>
        </button>
      </header>

      <div className="instructor-workspace__layout">
        <aside
          id="instructor-navigation"
          className={
            navigationOpen
              ? 'workspace-sidebar workspace-sidebar--open'
              : 'workspace-sidebar'
          }
        >
          <div className="workspace-sidebar__heading">
            <span className="eyebrow">INSTRUCTOR TOOLS</span>
            <h2>Assessment workspace</h2>
            <p>
              Create content, manage classes, monitor exams,
              and review results.
            </p>
          </div>

          <nav className="workspace-tabs" aria-label="Instructor tools">
            {availableNavigation.map((item) => {
              const active = activeSection === item.id

              return (
                <button
                  className={
                    active
                      ? 'workspace-tab workspace-tab--active'
                      : 'workspace-tab'
                  }
                  type="button"
                  key={item.id}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => selectSection(item.id)}
                >
                  <span className="workspace-tab__label">
                    <AppIcon icon={item.icon} aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  <small>{item.description}</small>
                </button>
              )
            })}
          </nav>
        </aside>

        <section className="workspace-content">
          <WorkspaceBreadcrumbs role="instructor" />
          <header className="workspace-page-header">
            <div>
              <span className="eyebrow">INSTRUCTOR WORKSPACE</span>
              <h1>{activeNavigationItem.label}</h1>
              <p>{activeNavigationItem.description}</p>
            </div>

            <span className="workspace-page-header__position">
              {String(
                availableNavigation.findIndex(
                  (item) => item.id === activeSection,
                ) + 1,
              ).padStart(2, '0')}
              <small>of {String(availableNavigation.length).padStart(2, '0')}</small>
            </span>
          </header>

          {activeSection === 'overview' ? (
            <Suspense fallback={<WorkspaceLoading label="Loading overview..." />}>
              <InstructorOverview onNavigate={selectSection} />
            </Suspense>
          ) : <AssessmentWorkspaceContent
            section={activeSection}
            label={activeNavigationItem.label}
            user={user}
            onOpenPracticals={() => selectSection('cli-practicals')}
          />}
        </section>
      </div>
    </div>
  )
}
