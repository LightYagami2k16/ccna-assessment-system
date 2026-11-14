import { useMemo } from 'react'
import useWorkspaceRoute from './useWorkspaceRoute'
import {
  administratorAssessmentToolPaths,
  workspaceRouteDefinitions,
} from '../routing/workspaceRoutes'
import { workspaceSubsections } from '../routing/workspaceSubsections'

export default function useInstructorSubsection(page, administratorMode) {
  const { sections } = workspaceSubsections[page]
  const basePath = administratorMode
    ? administratorAssessmentToolPaths[page]
    : workspaceRouteDefinitions.instructor.sectionPaths[page]
  const sectionPaths = useMemo(() => Object.fromEntries(
    sections.map(({ id, suffix }) => [id, `${basePath}${suffix}`]),
  ), [basePath, sections])

  return useWorkspaceRoute({
    role: administratorMode ? 'administrator' : 'instructor',
    initialSection: sections[0].id,
    sectionPaths,
    defaultSection: sections[0].id,
    defaultPath: basePath,
  })
}
