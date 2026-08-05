import { useEffect, useRef } from 'react'
import { recordExamIntegrityEvent } from '../services/examControlService'

export default function useExamIntegrityMonitor({
  attemptId,
  attemptType = 'quiz',
  enabled,
  onIncident,
  onEnforcement,
}) {
  const hiddenStartedAt = useRef(null)
  const wasFullscreen = useRef(Boolean(document.fullscreenElement))

  useEffect(() => {
    if (!attemptId || !enabled) return undefined

    async function record(eventType, details = {}) {
      try {
        const result = await recordExamIntegrityEvent({
          attemptId,
          attemptType,
          eventType,
          details,
        })
        const behavior = result?.behavior ?? 'warn'
        if (
          behavior !== 'monitor'
          && ['page_hidden', 'fullscreen_exited'].includes(eventType)
        ) {
          onIncident?.(eventType, result)
        }
        if (result?.autoSubmitted) {
          onEnforcement?.(result)
        }
      } catch {
        // A temporary connection failure must not interrupt the assessment.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenStartedAt.current = Date.now()
        void record('page_hidden')
        return
      }

      const awayDurationMs = hiddenStartedAt.current
        ? Date.now() - hiddenStartedAt.current
        : 0
      void record('page_visible', { awayDurationMs })
      hiddenStartedAt.current = null
    }

    function handleBlur() {
      void record('window_blur')
    }

    function handleFocus() {
      void record('window_focus')
    }

    function handleFullscreenChange() {
      const isFullscreen = Boolean(document.fullscreenElement)
      if (wasFullscreen.current && !isFullscreen) {
        void record('fullscreen_exited')
      }
      wasFullscreen.current = isFullscreen
    }

    function handleOffline() {
      onIncident?.('connection_lost', { operationalWarning: true })
      void record('connection_lost')
    }

    function handleOnline() {
      void record('connection_restored')
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
  }, [attemptId, attemptType, enabled, onEnforcement, onIncident])
}
