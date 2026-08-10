import { supabase } from '../lib/supabase'

const recentReports = new Map()
const DEDUPLICATION_WINDOW_MS = 60_000
const safeErrorNames = new Set([
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'AggregateError',
])

function safeErrorName(error) {
  return safeErrorNames.has(error?.name) ? error.name : 'Error'
}

function createSafeReport(error, details) {
  const kind = [
    'runtime',
    'unhandled_promise',
    'react_render',
  ].includes(details.kind)
    ? details.kind
    : 'runtime'

  return {
    kind,
    name: safeErrorName(error),
    component: details.component,
    context: {
      online: window.navigator.onLine,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      language: window.navigator.language,
      build: import.meta.env.VITE_BUILD_SHA ?? 'local',
    },
  }
}

export async function reportOperationalError(error, details = {}) {
  if (typeof window === 'undefined') return null

  const payload = createSafeReport(error, details)
  const reportKey = `${payload.kind}|${payload.name}|${payload.component}`
  const lastReportedAt = recentReports.get(reportKey) ?? 0

  if (Date.now() - lastReportedAt < DEDUPLICATION_WINDOW_MS) {
    return null
  }

  recentReports.set(reportKey, Date.now())

  try {
    const { data, error: reportError } = await supabase.rpc(
      'report_application_error',
      { p_payload: payload },
    )

    return reportError ? null : data
  } catch {
    return null
  }
}

export function installGlobalErrorMonitoring({ enabled = true } = {}) {
  if (!enabled || typeof window === 'undefined') return () => {}

  const handleError = (event) => {
    void reportOperationalError(event.error, {
      kind: 'runtime',
      component: 'Global window error handler',
    })
  }

  const handleUnhandledRejection = (event) => {
    void reportOperationalError(event.reason, {
      kind: 'unhandled_promise',
      component: 'Unhandled promise rejection',
    })
  }

  window.addEventListener('error', handleError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)

  return () => {
    window.removeEventListener('error', handleError)
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
  }
}

export async function getApplicationHealthSummary() {
  const { data, error } = await supabase.rpc(
    'get_application_health_summary',
  )

  if (error) throw error
  return data
}

export async function setApplicationErrorsResolved(
  eventIds,
  resolved,
  note = null,
) {
  const { data, error } = await supabase.rpc(
    'set_application_errors_resolved',
    {
      p_event_ids: eventIds,
      p_resolved: resolved,
      p_note: note,
    },
  )

  if (error) throw error
  return data
}
