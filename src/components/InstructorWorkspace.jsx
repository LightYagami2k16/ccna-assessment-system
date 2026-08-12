import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Archive,
  ChartNoAxesColumn,
  ClipboardList,
  Library,
  MonitorCheck,
  PanelLeftOpen,
  SquareTerminal,
  Users,
  X,
} from 'lucide-react'
import AppIcon from './AppIcon'
import WorkspaceLoading from './WorkspaceLoading'

const InstructorQuestionBank = lazy(() => import('./InstructorQuestionBank'))
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
  if (!userId) return 'questions'

  try {
    const storedSection = window.localStorage.getItem(
      `ccna-instructor-active-section:${userId}`,
    )

    return instructorSections.has(storedSection)
      ? storedSection
      : 'questions'
  } catch {
    return 'questions'
  }
}

export default function InstructorWorkspace({ user }) {
  const [activeSection, setActiveSection] = useState(() =>
    getStoredSection(user?.id),
  )
  const [navigationOpen, setNavigationOpen] = useState(false)
  const activeNavigationItem =
    instructorNavigation.find((item) => item.id === activeSection) ??
    instructorNavigation[0]

  useEffect(() => {
    if (!user?.id) return

    try {
      window.localStorage.setItem(
        `ccna-instructor-active-section:${user.id}`,
        activeSection,
      )
    } catch {
      // The workspace still works when browser storage is unavailable.
    }
  }, [activeSection, user?.id])

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
              instructorNavigation.find(
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
            {instructorNavigation.map((item) => {
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
                instructorNavigation.findIndex(
                  (item) => item.id === activeSection,
                ) + 1,
              ).padStart(2, '0')}
              <small>of {String(instructorNavigation.length).padStart(2, '0')}</small>
            </span>
          </header>

          <Suspense
            fallback={
              <WorkspaceLoading
                label={`Loading ${activeNavigationItem.label.toLowerCase()}...`}
              />
            }
          >
            {activeSection === 'questions' && (
              <InstructorQuestionBank user={user} />
            )}
            {activeSection === 'quizzes' && <InstructorQuizBuilder />}
            {activeSection === 'cli-practicals' && (
              <InstructorCliLabBuilder />
            )}
            {activeSection === 'assignments' && (
              <InstructorClassAssignments />
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
