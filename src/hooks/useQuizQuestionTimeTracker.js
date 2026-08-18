import { useCallback, useEffect, useRef } from 'react'
import { recordQuizQuestionTime } from '../services/quizAttemptService'

const SYNC_INTERVAL_MS = 5_000

function storageKey(attemptId) {
  return `ccna-quiz-question-time:${attemptId}`
}

function readPendingTime(attemptId) {
  if (!attemptId) return new Map()
  try {
    const value = JSON.parse(
      window.localStorage.getItem(storageKey(attemptId)) ?? '{}',
    )
    return new Map(Object.entries(value).map(([id, milliseconds]) => [
      id,
      Number(milliseconds) || 0,
    ]))
  } catch {
    return new Map()
  }
}

function persistPendingTime(attemptId, pending) {
  if (!attemptId) return
  try {
    window.localStorage.setItem(
      storageKey(attemptId),
      JSON.stringify(Object.fromEntries(pending)),
    )
  } catch {
    // Timing continues in memory if local storage is unavailable.
  }
}

export default function useQuizQuestionTimeTracker({
  attemptId,
  attemptQuestionId,
  clientId,
  enabled,
}) {
  const activeQuestionIdRef = useRef(null)
  const lastCheckpointRef = useRef(Date.now())
  const pendingMillisecondsRef = useRef(readPendingTime(attemptId))
  const syncingRef = useRef(false)

  const accumulateActiveTime = useCallback(() => {
    const now = Date.now()
    const questionId = activeQuestionIdRef.current

    if (
      enabled &&
      questionId &&
      document.visibilityState === 'visible'
    ) {
      const elapsed = Math.max(0, now - lastCheckpointRef.current)
      pendingMillisecondsRef.current.set(
        questionId,
        (pendingMillisecondsRef.current.get(questionId) ?? 0) + elapsed,
      )
      persistPendingTime(attemptId, pendingMillisecondsRef.current)
    }

    lastCheckpointRef.current = now
  }, [attemptId, enabled])

  const flush = useCallback(async () => {
    accumulateActiveTime()

    if (
      !enabled ||
      !attemptId ||
      !clientId ||
      syncingRef.current ||
      !navigator.onLine
    ) {
      return false
    }

    const entries = [...pendingMillisecondsRef.current.entries()]
      .map(([questionId, milliseconds]) => ({
        questionId,
        seconds: Math.floor(milliseconds / 1000),
      }))
      .filter((entry) => entry.seconds > 0)

    if (!entries.length) return true

    syncingRef.current = true

    try {
      for (const entry of entries) {
        const milliseconds =
          pendingMillisecondsRef.current.get(entry.questionId) ?? 0
        const sentMilliseconds = entry.seconds * 1000

        pendingMillisecondsRef.current.set(
          entry.questionId,
          Math.max(0, milliseconds - sentMilliseconds),
        )
        persistPendingTime(attemptId, pendingMillisecondsRef.current)

        try {
          await recordQuizQuestionTime({
            attemptId,
            attemptQuestionId: entry.questionId,
            elapsedSeconds: entry.seconds,
            clientId,
          })
        } catch (error) {
          pendingMillisecondsRef.current.set(
            entry.questionId,
            (pendingMillisecondsRef.current.get(entry.questionId) ?? 0) +
              sentMilliseconds,
          )
          persistPendingTime(attemptId, pendingMillisecondsRef.current)
          throw error
        }
      }

      persistPendingTime(attemptId, pendingMillisecondsRef.current)

      return true
    } catch {
      return false
    } finally {
      syncingRef.current = false
    }
  }, [accumulateActiveTime, attemptId, clientId, enabled])

  useEffect(() => {
    pendingMillisecondsRef.current = readPendingTime(attemptId)
  }, [attemptId])

  useEffect(() => {
    accumulateActiveTime()
    activeQuestionIdRef.current =
      enabled && attemptQuestionId ? attemptQuestionId : null
    lastCheckpointRef.current = Date.now()

    if (enabled) void flush()
  }, [accumulateActiveTime, attemptQuestionId, enabled, flush])

  useEffect(() => {
    if (!enabled) return undefined

    const intervalId = window.setInterval(() => {
      void flush()
    }, SYNC_INTERVAL_MS)

    function handleVisibilityChange() {
      accumulateActiveTime()
      if (document.visibilityState === 'visible') {
        lastCheckpointRef.current = Date.now()
      } else {
        void flush()
      }
    }

    function handleOnline() {
      void flush()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      )
      window.removeEventListener('online', handleOnline)
      accumulateActiveTime()
      void flush()
    }
  }, [accumulateActiveTime, enabled, flush])

  return { flush }
}
