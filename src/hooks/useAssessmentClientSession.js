import { useCallback, useEffect, useRef, useState } from 'react'
import {
  claimAssessmentClientSession,
  getAssessmentClientId,
  heartbeatAssessmentClientSession,
  releaseAssessmentClientSession,
} from '../services/assessmentClientSessionService'

const HEARTBEAT_INTERVAL_MS = 20_000

export default function useAssessmentClientSession({
  assessmentType,
  attemptId,
  enabled = true,
}) {
  const clientIdRef = useRef(getAssessmentClientId())
  const [claimVersion, setClaimVersion] = useState(0)
  const [status, setStatus] = useState(enabled ? 'claiming' : 'inactive')
  const [message, setMessage] = useState('')

  const retry = useCallback(() => {
    setStatus('claiming')
    setMessage('')
    setClaimVersion((value) => value + 1)
  }, [])

  const release = useCallback(async () => {
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

    let cancelled = false
    let intervalId = null

    async function claim() {
      try {
        await claimAssessmentClientSession({
          assessmentType,
          attemptId,
          clientId: clientIdRef.current,
        })

        if (cancelled) return
        setStatus('active')
        setMessage('')

        intervalId = window.setInterval(async () => {
          try {
            await heartbeatAssessmentClientSession({
              assessmentType,
              attemptId,
              clientId: clientIdRef.current,
            })
          } catch (error) {
            if (cancelled) return
            if (!navigator.onLine) return
            window.clearInterval(intervalId)
            setStatus('blocked')
            setMessage(
              error?.message ??
                'This assessment session is no longer active on this browser.',
            )
          }
        }, HEARTBEAT_INTERVAL_MS)
      } catch (error) {
        if (cancelled) return
        setStatus('blocked')
        setMessage(
          error?.message ??
            'This assessment is already open in another browser or device.',
        )
      }
    }

    void claim()

    return () => {
      cancelled = true
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [assessmentType, attemptId, claimVersion, enabled])

  return {
    clientId: clientIdRef.current,
    status,
    message,
    retry,
    release,
  }
}
