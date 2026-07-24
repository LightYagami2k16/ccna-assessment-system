import { useEffect, useRef } from 'react'
import { recordExamIntegrityEvent } from '../services/examControlService'

export default function useExamIntegrityMonitor({
  attemptId,
  enabled,
  onIncident,
}) {
  const hiddenStartedAt = useRef(null)
  const wasFullscreen = useRef(Boolean(document.fullscreenElement))

  useEffect(() => {
    if (!attemptId || !enabled) return undefined

    function record(eventType, details = {}) {
      void recordExamIntegrityEvent({
        attemptId,
        eventType,
        details,
      }).catch(() => {})
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenStartedAt.current = Date.now()
        record('page_hidden')
        onIncident?.('page_hidden')
        return
      }

      const awayDurationMs = hiddenStartedAt.current
        ? Date.now() - hiddenStartedAt.current
        : 0
      record('page_visible', { awayDurationMs })
      hiddenStartedAt.current = null
    }

    function handleBlur() {
      record('window_blur')
    }

    function handleFocus() {
      record('window_focus')
    }

    function handleFullscreenChange() {
      const isFullscreen = Boolean(document.fullscreenElement)
      if (wasFullscreen.current && !isFullscreen) {
        record('fullscreen_exited')
        onIncident?.('fullscreen_exited')
      }
      wasFullscreen.current = isFullscreen
    }

    function handleOffline() {
      record('connection_lost')
      onIncident?.('connection_lost')
    }

    function handleOnline() {
      record('connection_restored')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [attemptId, enabled, onIncident])
}
