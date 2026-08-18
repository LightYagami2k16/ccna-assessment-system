import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getWorkspaceRoute,
  pushWorkspacePath,
  replaceWorkspacePath,
  workspaceRouteDefinitions,
} from '../routing/workspaceRoutes'

function sectionForRoute(route, role, sectionPaths) {
  if (route?.role !== role) return null

  return Object.entries(sectionPaths)
    .sort(([, firstPath], [, secondPath]) =>
      secondPath.length - firstPath.length)
    .find(
      ([, path]) =>
        route.path === path || route.path.startsWith(`${path}/`),
    )?.[0] ?? null
}

export default function useWorkspaceRoute({
  role,
  initialSection,
  storageKey,
  sectionPaths: customSectionPaths,
  defaultSection: customDefaultSection,
  defaultPath: customDefaultPath,
}) {
  const definition = workspaceRouteDefinitions[role]
  const sectionPaths = customSectionPaths ?? definition.sectionPaths
  const defaultSection = customDefaultSection ?? definition.defaultSection
  const defaultPath = customDefaultPath ?? definition.defaultPath
  const validInitialSection = sectionPaths[initialSection]
    ? initialSection
    : defaultSection
  const [activeSection, setActiveSectionState] = useState(() => {
    const route = getWorkspaceRoute()
    const routedSection = sectionForRoute(route, role, sectionPaths)
    return routedSection
      ? routedSection
      : validInitialSection
  })
  const initialRender = useRef(true)

  useEffect(() => {
    const route = getWorkspaceRoute()
    const routedSection = sectionForRoute(route, role, sectionPaths)

    if (!route) {
      replaceWorkspacePath(sectionPaths[activeSection])
    } else if (
      route.role === role &&
      !routedSection &&
      !route.assessmentFocus
    ) {
      replaceWorkspacePath(defaultPath)
      setActiveSectionState(defaultSection)
    }
  }, [activeSection, defaultPath, defaultSection, role, sectionPaths])

  useEffect(() => {
    function handleHashChange() {
      const route = getWorkspaceRoute()
      const routedSection = sectionForRoute(route, role, sectionPaths)
      if (!routedSection) return

      setActiveSectionState(routedSection)

      if (initialRender.current) return
      window.requestAnimationFrame(() => {
        document.getElementById('main-workspace-content')?.focus()
      })
    }

    window.addEventListener('hashchange', handleHashChange)
    initialRender.current = false
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [role, sectionPaths])

  useEffect(() => {
    if (!storageKey) return

    try {
      window.localStorage.setItem(storageKey, activeSection)
    } catch {
      // The route remains the source of truth when storage is unavailable.
    }
  }, [activeSection, storageKey])

  const setActiveSection = useCallback(
    (section) => {
      const path = sectionPaths[section]
      if (!path) return

      setActiveSectionState(section)
      pushWorkspacePath(path)
    },
    [sectionPaths],
  )

  return [activeSection, setActiveSection]
}
