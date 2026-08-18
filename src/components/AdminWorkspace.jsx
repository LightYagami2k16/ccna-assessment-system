import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Activity,
  ClipboardList,
  ShieldCheck,
  Users,
} from 'lucide-react'
import AppIcon from './AppIcon'
import WorkspaceLoading from './WorkspaceLoading'

const AdminUserManagement = lazy(
  () => import('./AdminUserManagement'),
)
const InstructorWorkspace = lazy(
  () => import('./InstructorWorkspace'),
)
const AdminAuditHistory = lazy(
  () => import('./AdminAuditHistory'),
)
const AdminSystemHealth = lazy(
  () => import('./AdminSystemHealth'),
)

const adminSections = new Set([
  'accounts',
  'security-history',
  'system-health',
  'assessment-tools',
])

const adminNavigation = [
  {
    id: 'accounts',
    icon: Users,
    label: 'User accounts',
    description: 'Roles and workspace access',
  },
  {
    id: 'security-history',
    icon: ShieldCheck,
    label: 'Security history',
    description: 'Account and role audit events',
  },
  {
    id: 'system-health',
    icon: Activity,
    label: 'System health',
    description: 'Runtime errors and backend readiness',
  },
  {
    id: 'assessment-tools',
    icon: ClipboardList,
    label: 'Assessment tools',
    description: 'Instructor content and class management',
  },
]

function getStoredAdminSection(userId) {
  if (!userId) return 'accounts'

  try {
    const storedSection = window.localStorage.getItem(
      `ccna-admin-active-section:${userId}`,
    )

    return adminSections.has(storedSection)
      ? storedSection
      : 'accounts'
  } catch {
    return 'accounts'
  }
}

export default function AdminWorkspace({
  user,
  previewMode = false,
}) {
  const [activeSection, setActiveSection] = useState(() =>
    getStoredAdminSection(user?.id),
  )
  const activeItem =
    adminNavigation.find((item) => item.id === activeSection) ??
    adminNavigation[0]

  useEffect(() => {
    if (!user?.id) return

    try {
      window.localStorage.setItem(
        `ccna-admin-active-section:${user.id}`,
        activeSection,
      )
    } catch {
      // Navigation remains usable without browser storage.
    }
  }, [activeSection, user?.id])

  return (
    <div className="admin-workspace">
      <nav className="admin-workspace-tabs" aria-label="Administrator tools">
        {adminNavigation.map((item) => {
          const active = activeSection === item.id

          return (
            <button
              className={
                active
                  ? 'admin-workspace-tab admin-workspace-tab--active'
                  : 'admin-workspace-tab'
              }
              type="button"
              key={item.id}
              aria-current={active ? 'page' : undefined}
              onClick={() => setActiveSection(item.id)}
            >
              <span className="admin-workspace-tab__label">
                <AppIcon icon={item.icon} aria-hidden="true" />
                <span>{item.label}</span>
              </span>
              <small>{item.description}</small>
            </button>
          )
        })}
      </nav>

      <header className="workspace-page-header admin-page-header">
        <div>
          <span className="eyebrow">ADMINISTRATOR WORKSPACE</span>
          <h1>{activeItem.label}</h1>
          <p>{activeItem.description}</p>
        </div>

        <span className="workspace-page-header__position">
          {String(
            adminNavigation.findIndex(
              (item) => item.id === activeSection,
            ) + 1,
          ).padStart(2, '0')}
          <small>
            of {String(adminNavigation.length).padStart(2, '0')}
          </small>
        </span>
      </header>

      <Suspense
        fallback={
          <WorkspaceLoading
            label={`Loading ${activeItem.label.toLowerCase()}...`}
          />
        }
      >
        {activeSection === 'accounts' && (
          <AdminUserManagement
            currentUser={user}
            previewMode={previewMode}
          />
        )}

        {activeSection === 'assessment-tools' && (
          <InstructorWorkspace
            user={user}
            administratorMode
          />
        )}

        {activeSection === 'security-history' && (
          <AdminAuditHistory previewMode={previewMode} />
        )}

        {activeSection === 'system-health' && (
          <AdminSystemHealth previewMode={previewMode} />
        )}
      </Suspense>
    </div>
  )
}
