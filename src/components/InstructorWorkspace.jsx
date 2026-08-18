import { lazy, Suspense, useState } from 'react'
import {
  Archive,
  ChartNoAxesColumn,
  ClipboardList,
  LayoutDashboard,
  Library,
  MonitorCheck,
  PanelLeftOpen,
  SquareTerminal,
  Users,
  X,
} from 'lucide-react'
import AppIcon from './AppIcon'
import WorkspaceLoading from './WorkspaceLoading'
import useWorkspaceRoute from '../hooks/useWorkspaceRoute'
import { administratorAssessmentToolPaths } from '../routing/workspaceRoutes'

const InstructorQuestionBank = lazy(() => import('./InstructorQuestionBank'))
const InstructorOverview = lazy(() => import('./InstructorOverview'))
const InstructorQuizBuilder = lazy(() => import('./InstructorQuizBuilder'))
const InstructorResultsDashboard = lazy(
  () => import('./InstructorResultsDashboard'),
)
const InstructorClassAssignments = lazy(
  () => import('./InstructorClassAssignments'),
)
const ExamControlsDashboard = lazy(() => import('./ExamControlsDashboard'))
const InstructorCliLabBuilder = lazy(
  () => import('./InstructorCliLabBuilder'),
)
const InstructorCliResults = lazy(() => import('./InstructorCliResults'))
const InstructorOverallResults = lazy(
  () => import('./InstructorOverallResults'),
)
const InstructorContentBackup = lazy(
  () => import('./InstructorContentBackup'),
)

const instructorSections = new Set([
  'overview',
  'questions',
  'quizzes',
  'cli-practicals',
  'assignments',
  'exam-controls',
  'results',
  'content-backup',
])

const instructorNavigation = [
  {
    id: 'overview',
    icon: LayoutDashboard,
    label: 'Overview',
    description: 'Teaching priorities and shortcuts',
  },
  {
    id: 'questions',
    icon: Library,
    label: 'Question bank',
    description: 'Modules and reusable questions',
  },
  {
    id: 'quizzes',
    icon: ClipboardList,
    label: 'Quizzes',
    description: 'Build and publish assessments',
  },
  {
    id: 'cli-practicals',
    icon: SquareTerminal,
    label: 'CLI practicals',
    description: 'Create Cisco configuration exams',
  },
  {
    id: 'assignments',
    icon: Users,
    label: 'Classes & assignments',
    description: 'Enrollment and quiz access',
  },
  {
    id: 'exam-controls',
    icon: MonitorCheck,
    label: 'Exam controls',
    description: 'Schedules and live monitoring',
  },
  {
    id: 'results',
    icon: ChartNoAxesColumn,
    label: 'Student results',
    description: 'Review attempts and browser events',
  },
  {
    id: 'content-backup',
    icon: Archive,
    label: 'Content backup',
    description: 'Protect and restore instructional content',
  },
]

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
  administratorMode = false,
}) {
  const [activeSection, setActiveSection] = useWorkspaceRoute({
    role: administratorMode ? 'administrator' : 'instructor',
    initialSection: getStoredSection(user?.id),
    storageKey: user?.id
      ? `ccna-instructor-active-section:${user.id}`
      : null,
    sectionPaths: administratorMode
      ? administratorAssessmentToolPaths
      : undefined,
    defaultSection: administratorMode ? 'questions' : undefined,
    defaultPath: administratorMode
      ? administratorAssessmentToolPaths.questions
      : undefined,
  })
  const [navigationOpen, setNavigationOpen] = useState(false)
  const availableNavigation = administratorMode
    ? instructorNavigation.filter((item) => item.id !== 'overview')
    : instructorNavigation
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

          <Suspense
            fallback={
              <WorkspaceLoading
                label={`Loading ${activeNavigationItem.label.toLowerCase()}...`}
              />
            }
          >
            {activeSection === 'overview' && !administratorMode && (
              <InstructorOverview onNavigate={selectSection} />
            )}
            {activeSection === 'questions' && (
              <InstructorQuestionBank user={user} />
            )}
            {activeSection === 'quizzes' && <InstructorQuizBuilder />}
            {activeSection === 'cli-practicals' && (
              <InstructorCliLabBuilder />
            )}
            {activeSection === 'assignments' && (
              <InstructorClassAssignments
                administratorMode={administratorMode}
              />
            )}
            {activeSection === 'exam-controls' && (
              <ExamControlsDashboard />
            )}
            {activeSection === 'results' && (
              <div className="combined-results-workspace">
                <InstructorOverallResults />
                <InstructorResultsDashboard />
                <InstructorCliResults />
              </div>
            )}
            {activeSection === 'content-backup' && (
              <InstructorContentBackup />
            )}
          </Suspense>
        </section>
      </div>
    </div>
  )
}
