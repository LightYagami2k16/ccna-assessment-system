import { useCallback, useEffect, useRef, useState } from 'react'
import { getAssessmentReviewPolicy } from '../services/assessmentReviewPolicyService'
import { emptyReviewSchedule, reviewScheduleFromPolicy } from '../services/reviewSchedule'

export default function useAssessmentReviewSchedule(assessmentType, assessmentId) {
  const key = `${assessmentType}:${assessmentId || ''}`
  const [state, setState] = useState(() => ({ key, value: emptyReviewSchedule(), ready: !assessmentId, loading: Boolean(assessmentId), error: '' }))
  const request = useRef(0)
  const retry = useCallback(async () => {
    const generation = ++request.current
    if (!assessmentId) {
      setState({ key, value: emptyReviewSchedule(), ready: true, loading: false, error: '' })
      return
    }
    setState((current) => ({ ...current, key, value: current.key === key ? current.value : emptyReviewSchedule(), ready: false, loading: true, error: '' }))
    try {
      const policy = await getAssessmentReviewPolicy(assessmentType, assessmentId)
      const value = reviewScheduleFromPolicy(policy)
      if (generation === request.current) setState({ key, value, ready: true, loading: false, error: '' })
    } catch {
      if (generation === request.current) setState((current) => ({ ...current, key, ready: false, loading: false, error: 'Review settings could not be loaded. Reload them before saving this assessment.' }))
    }
  }, [assessmentType, assessmentId, key])
  useEffect(() => {
    void retry()
    return () => { request.current += 1 }
  }, [retry])
  const setValue = useCallback((value) => setState((current) => ({ ...current, key, value })), [key])
  const reset = useCallback(() => {
    request.current += 1
    setState({ key: `${assessmentType}:`, value: emptyReviewSchedule(), ready: true, loading: false, error: '' })
  }, [assessmentType])
  const matches = state.key === key
  return {
    value: matches ? state.value : emptyReviewSchedule(), setValue,
    ready: !assessmentId || (matches && state.ready),
    loading: Boolean(assessmentId) && (!matches || state.loading),
    error: matches ? state.error : '', retry, reset,
  }
}
