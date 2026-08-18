export const workspaceRouteDefinitions = {
  student: {
    defaultSection: 'overview',
    defaultPath: '/student/overview',
    sectionPaths: {
      overview: '/student/overview',
      available: '/student/assessments',
      cli: '/student/practicals',
      history: '/student/history',
      classes: '/student/classes',
      guide: '/student/guide',
    },
  },
  instructor: {
    defaultSection: 'overview',
    defaultPath: '/instructor/overview',
    sectionPaths: {
      overview: '/instructor/overview',
      questions: '/instructor/question-bank',
      quizzes: '/instructor/quizzes',
      'cli-practicals': '/instructor/practicals',
      assignments: '/instructor/classes',
      'exam-controls': '/instructor/exam-controls',
      results: '/instructor/results',
      'content-backup': '/instructor/content-backup',
    },
  },
  administrator: {
    defaultSection: 'overview',
    defaultPath: '/admin/overview',
    sectionPaths: {
      overview: '/admin/overview',
      accounts: '/admin/users',
      'security-history': '/admin/security',
      'system-health': '/admin/system-health',
      'assessment-tools': '/admin/assessment-tools',
    },
  },
}

export const administratorAssessmentToolPaths = {
  questions: '/admin/assessment-tools/question-bank',
  quizzes: '/admin/assessment-tools/quizzes',
  'cli-practicals': '/admin/assessment-tools/practicals',
  assignments: '/admin/assessment-tools/classes',
  'exam-controls': '/admin/assessment-tools/exam-controls',
  results: '/admin/assessment-tools/results',
  'content-backup': '/admin/assessment-tools/content-backup',
}

export function normalizeWorkspaceRole(role) {
  return role === 'admin' ? 'administrator' : role
}

export function getWorkspaceHashPath() {
  const rawHash = window.location.hash.replace(/^#/, '')
  const path = rawHash.split('?')[0]
  return path.startsWith('/') ? path : ''
}

export function getWorkspaceRoute() {
  const path = getWorkspaceHashPath()
  if (!path) return null

  const roleSegment = path.split('/')[1]
  const role = roleSegment === 'admin' ? 'administrator' : roleSegment
  const definition = workspaceRouteDefinitions[role]

  if (!definition) {
    return { role: null, path, section: null, assessmentFocus: false }
  }

  const section = Object.entries(definition.sectionPaths).find(
    ([, sectionPath]) =>
      sectionPath === path || path.startsWith(`${sectionPath}/`),
  )?.[0] ?? null
  const assessmentFocus =
    role === 'student' &&
    /^\/student\/(quiz|practical)\/[^/]+$/.test(path)

  return { role, path, section, assessmentFocus }
}

export function workspaceDefaultPathForRole(role) {
  return workspaceRouteDefinitions[normalizeWorkspaceRole(role)]?.defaultPath ?? ''
}

export function replaceWorkspacePath(path) {
  if (!path || getWorkspaceHashPath() === path) return

  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}#${path}`,
  )
}

export function pushWorkspacePath(path) {
  if (!path || getWorkspaceHashPath() === path) return
  window.location.hash = path
}

export function clearWorkspacePath() {
  if (!getWorkspaceHashPath()) return

  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}`,
  )
}
