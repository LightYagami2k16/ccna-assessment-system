import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acquireAssessmentTabLock,
  claimAssessmentClientSession,
  getAssessmentClientId,
  heartbeatAssessmentClientSession,
  releaseAssessmentClientSession,
} from '../services/assessmentClientSessionService'

const HEARTBEAT_INTERVAL_MS = 20_000
const RECONNECT_INTERVAL_MS = 5_000

function isOwnershipError(error) {
  const message = String(error?.message ?? '').toLowerCase()
  return (
    message.includes('already open') ||
    message.includes('no longer controls') ||
    message.includes('no longer active') ||
    message.includes('student access is required') ||
    error?.code === 'PGRST202' ||
    error?.code === '42883'
  )
}

export default function useAssessmentClientSession({
  assessmentType,
  attemptId,
  enabled = true,
}) {
  const clientIdRef = useRef(getAssessmentClientId())
  const tabLockReleaseRef = useRef(null)
  const [claimVersion, setClaimVersion] = useState(0)
  const [status, setStatus] = useState(enabled ? 'claiming' : 'inactive')
  const [message, setMessage] = useState('')
  const [connectionStatus, setConnectionStatus] = useState(
    navigator.onLine ? 'online' : 'offline',
  )

  const retry = useCallback(() => {
    setStatus('claiming')
    setMessage('')
    setClaimVersion((value) => value + 1)
  }, [])

  const release = useCallback(async () => {
    tabLockReleaseRef.current?.()
    tabLockReleaseRef.current = null

    if (!attemptId) return

    try {
      await releaseAssessmentClientSession({
        assessmentType,
        attemptId,
        clientId: clientIdRef.current,
      })
    } catch {
      // The server lease will become reclaimable after its stale timeout.
    }
  }, [assessmentType, attemptId])

  useEffect(() => {
    if (!enabled || !attemptId) {
      setStatus('inactive')
      return undefined
    }

    setStatus('claiming')
    setConnectionStatus(navigator.onLine ? 'online' : 'offline')
    setMessage('')

    let cancelled = false
    let timerId = null
    let claimed = false
    let claimInFlight = false
    let requestInFlight = false
    let releaseTabLock = null

    function schedule(callback, delay) {
      window.clearTimeout(timerId)
      timerId = window.setTimeout(callback, delay)
    }

    function block(messageText) {
      claimed = false
      window.clearTimeout(timerId)
      releaseTabLock?.()
      releaseTabLock = null
      tabLockReleaseRef.current = null
      setStatus('blocked')
      setMessage(messageText)
    }

    async function heartbeat() {
      if (cancelled || requestInFlight || !claimed) return

      if (!navigator.onLine) {
        setConnectionStatus('offline')
        setMessage('You are offline. Reconnecting automatically...')
        schedule(() => void heartbeat(), RECONNECT_INTERVAL_MS)
        return
      }

      requestInFlight = true
      try {
        await heartbeatAssessmentClientSession({
          assessmentType,
          attemptId,
          clientId: clientIdRef.current,
        })
        if (cancelled) return
        setConnectionStatus('online')
        setMessage('')
        schedule(() => void heartbeat(), HEARTBEAT_INTERVAL_MS)
      } catch (error) {
        if (cancelled) return
        if (isOwnershipError(error)) {
          block(
            error?.message ??
              'This assessment session is no longer active on this browser.',
          )
          return
        }
        setConnectionStatus(navigator.onLine ? 'reconnecting' : 'offline')
        setMessage(
          navigator.onLine
            ? 'The server connection was interrupted. Reconnecting automatically...'
            : 'You are offline. Reconnecting automatically...',
        )
        schedule(() => void heartbeat(), RECONNECT_INTERVAL_MS)
      } finally {
        requestInFlight = false
      }
    }

    async function claim() {
      if (cancelled || claimed || claimInFlight) return
      claimInFlight = true

      try {
        const tabLock = await acquireAssessmentTabLock({
          assessmentType,
          attemptId,
        })

        if (cancelled) {
          tabLock.release()
          return
        }

        if (!tabLock.acquired) {
          block(
            'This assessment is already open in another tab in this browser.',
          )
          return
        }

        releaseTabLock = tabLock.release
        tabLockReleaseRef.current = tabLock.release

        const claimResult = await claimAssessmentClientSession({
          assessmentType,
          attemptId,
          clientId: clientIdRef.current,
        })

        if (cancelled) return
        claimed = true
        setStatus('active')
        setConnectionStatus('online')
        setMessage('')
        if (claimResult?.takeover) {
          setMessage('This browser recovered the inactive assessment session.')
        }
        schedule(() => void heartbeat(), HEARTBEAT_INTERVAL_MS)
      } catch (error) {
        if (cancelled) return
        releaseTabLock?.()
        releaseTabLock = null
        tabLockReleaseRef.current = null

        if (isOwnershipError(error)) {
          block(
            error?.message ??
              'This assessment is already open in another browser or device.',
          )
          return
        }

        setConnectionStatus(navigator.onLine ? 'reconnecting' : 'offline')
        setMessage(
          navigator.onLine
            ? 'Unable to contact the assessment server. Retrying automatically...'
            : 'You are offline. Reconnecting automatically...',
        )
        schedule(() => void claim(), RECONNECT_INTERVAL_MS)
      } finally {
        claimInFlight = false
      }
    }

    function reconnectNow() {
      if (claimed) {
        void heartbeat()
      } else {
        void claim()
      }
    }

    function handleOffline() {
      setConnectionStatus('offline')
      setMessage('You are offline. Reconnecting automatically...')
    }

    window.addEventListener('online', reconnectNow)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', reconnectNow)

    void claim()

    return () => {
      cancelled = true
      window.clearTimeout(timerId)
      window.removeEventListener('online', reconnectNow)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', reconnectNow)
      releaseTabLock?.()
      if (tabLockReleaseRef.current === releaseTabLock) {
        tabLockReleaseRef.current = null
      }
    }
  }, [assessmentType, attemptId, claimVersion, enabled])

  return {
    clientId: clientIdRef.current,
    status,
    connectionStatus,
    message,
    retry,
    release,
  }
}
