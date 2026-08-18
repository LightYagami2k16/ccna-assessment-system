import { useEffect, useRef } from 'react'

export const ACCOUNT_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000

const ACTIVITY_EVENTS = [
  'keydown',
  'pointerdown',
  'scroll',
  'touchstart',
]

function activityStorageKey(userId) {
  return `ccna-account-last-activity:${userId}`
}

function readLastActivity(key, fallback) {
  try {
    const value = Number(window.localStorage.getItem(key))
    return Number.isFinite(value) && value > 0 ? value : fallback
  } catch {
    return fallback
  }
}

function writeLastActivity(key, value) {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // The current tab still tracks inactivity without browser storage.
  }
}

export default function useInactivityLogout({
  userId,
  enabled = true,
  timeoutMs = ACCOUNT_INACTIVITY_TIMEOUT_MS,
  onInactive,
}) {
  const callbackRef = useRef(onInactive)

  useEffect(() => {
    callbackRef.current = onInactive
  }, [onInactive])

  useEffect(() => {
    if (!enabled || !userId) return undefined

    const storageKey = activityStorageKey(userId)
    let lastLocalActivity = Date.now()
    let timeoutId = null
    let logoutStarted = false

    function clearTimer() {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    function scheduleCheck() {
      clearTimer()
      if (logoutStarted) return

      const now = Date.now()
      const lastActivity = Math.max(
        lastLocalActivity,
        readLastActivity(storageKey, lastLocalActivity),
      )
      const remaining = timeoutMs - (now - lastActivity)

      if (remaining <= 0) {
        logoutStarted = true
        void callbackRef.current?.()
        return
      }

      timeoutId = window.setTimeout(scheduleCheck, remaining)
    }

    function inactivityHasExpired() {
      const lastActivity = Math.max(
        lastLocalActivity,
        readLastActivity(storageKey, lastLocalActivity),
      )

      if (Date.now() - lastActivity < timeoutMs) return false

      clearTimer()
      logoutStarted = true
      void callbackRef.current?.()
      return true
    }

    function recordActivity() {
      if (logoutStarted) return
      if (inactivityHasExpired()) return

      lastLocalActivity = Date.now()
      writeLastActivity(storageKey, lastLocalActivity)
      scheduleCheck()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        if (!inactivityHasExpired()) recordActivity()
      }
    }

    function handleFocus() {
      if (!inactivityHasExpired()) recordActivity()
    }

    function handleStorage(event) {
      if (event.key !== storageKey || !event.newValue) return
      const sharedActivity = Number(event.newValue)
      if (Number.isFinite(sharedActivity)) {
        lastLocalActivity = Math.max(
          lastLocalActivity,
          sharedActivity,
        )
        scheduleCheck()
      }
    }

    recordActivity()

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, {
        passive: true,
      })
    })
    window.addEventListener('focus', handleFocus)
    window.addEventListener('storage', handleStorage)
    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    )

    return () => {
      clearTimer()
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity)
      })
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
    }
  }, [enabled, timeoutMs, userId])
}
