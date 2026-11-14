import { useCallback, useEffect, useRef, useState } from 'react'
import { getStudentAttemptReviewAccess } from '../services/studentAttemptReviewService'
import useStudentPageRefresh from './useStudentPageRefresh'

const keyFor = (type, id) => `${type}:${id}`

// Review permissions load independently: an older server must still show grades.
export default function useStudentAttemptReviewAccess() {
  const [access, setAccess] = useState(() => new Set())
  const [failed, setFailed] = useState(false)
  const request = useRef(0)
  const refreshAccess = useCallback(async () => {
    const generation = ++request.current
    try {
      const rows = await getStudentAttemptReviewAccess()
      const next = new Set(rows.map((row) => keyFor(row.assessmentType, row.attemptId)))
      if (generation !== request.current) return new Set()
      setAccess(next)
      setFailed(false)
      return next
    } catch {
      if (generation === request.current) {
        setAccess(new Set())
        setFailed(true)
      }
      return new Set()
    }
  }, [])
  useEffect(() => {
    void refreshAccess()
    return () => { request.current += 1 }
  }, [refreshAccess])
  useStudentPageRefresh(refreshAccess, { intervalMs: 30000 })
  const revoke = useCallback((type, id) => {
    request.current += 1
    setAccess((current) => {
      const next = new Set(current)
      next.delete(keyFor(type, id))
      return next
    })
  }, [])
  return {
    canReview: (type, id) => access.has(keyFor(type, id)),
    refreshAccess,
    revoke,
    failed,
  }
}
