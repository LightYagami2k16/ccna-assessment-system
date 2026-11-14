import { useEffect, useRef } from 'react'

// Keep visible student lists current without a permanent refresh control.
export default function useStudentPageRefresh(load, { enabled = true, intervalMs = 0 } = {}) {
  const busy = useRef(false)
  const lastRefresh = useRef(0)
  useEffect(() => {
    if (!enabled) return
    async function refreshVisible() {
      if (document.visibilityState !== 'visible' || busy.current || Date.now() - lastRefresh.current < 1000) return
      lastRefresh.current = Date.now()
      busy.current = true
      try {
        await load()
      } finally {
        busy.current = false
      }
    }
    const timer = intervalMs ? window.setInterval(() => void refreshVisible(), intervalMs) : null
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      if (timer !== null) window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [enabled, intervalMs, load])
}
