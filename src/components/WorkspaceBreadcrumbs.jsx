import { useSyncExternalStore } from 'react'
import { getWorkspaceHashPath, workspaceRouteDefinitions, administratorAssessmentToolPaths } from '../routing/workspaceRoutes'
import { workspaceSubsections } from '../routing/workspaceSubsections'
import { instructorNavigation } from '../routing/assessmentNavigation'
import './WorkspaceBreadcrumbs.css'

const roleLabels = {
  student: { competitions: 'CLI Duels', overview: 'Overview', available: 'Quizzes', cli: 'CLI practicals', history: 'Results & history', classes: 'My classes', guide: 'Exam guide' },
  administrator: { competitions: 'CLI Duels', overview: 'Overview', accounts: 'User accounts', 'security-history': 'Security history', 'system-health': 'System health', 'assessment-tools': 'Assessment tools' },
  instructor: Object.fromEntries(instructorNavigation.map(({ id, label }) => [id, label])),
}
function subscribe(listener) {
  window.addEventListener('hashchange', listener)
  window.addEventListener('workspacepathchange', listener)
  return () => {
    window.removeEventListener('hashchange', listener)
    window.removeEventListener('workspacepathchange', listener)
  }
}
function matchingEntry(paths, path) {
  return Object.entries(paths).sort((a, b) => b[1].length - a[1].length)
    .find(([, base]) => path === base || path.startsWith(`${base}/`))
}
export default function WorkspaceBreadcrumbs({ role }) {
  const path = useSyncExternalStore(subscribe, getWorkspaceHashPath)
  const definition = workspaceRouteDefinitions[role]
  const page = matchingEntry(definition.sectionPaths, path)
  if (!page) return null
  const items = [{ label: 'Overview', path: definition.defaultPath }]
  const [section, basePath] = page
  if (section !== 'overview') items.push({
    label: roleLabels[role][section], path: basePath,
    href: role === 'administrator' && section === 'assessment-tools' ? administratorAssessmentToolPaths.questions : basePath,
  })
  const tool = role === 'administrator' && section === 'assessment-tools'
    ? matchingEntry(administratorAssessmentToolPaths, path) : null
  const contentSection = tool?.[0] ?? section
  const contentPath = tool?.[1] ?? basePath
  if (tool) items.push({ label: roleLabels.instructor[contentSection], path: contentPath })
  const subsection = workspaceSubsections[contentSection]?.sections.find(({ suffix }) => suffix && path === `${contentPath}${suffix}`)
  if (subsection) items.push({ label: subsection.label, path })
  return <nav className="workspace-breadcrumbs" aria-label="Breadcrumb"><ol>
    {items.map((item, index) => <li key={item.path}>
      {index < items.length - 1 ? <a href={`#${item.href ?? item.path}`}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
    </li>)}
  </ol></nav>
}
