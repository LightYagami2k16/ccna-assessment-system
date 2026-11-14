import { supabase } from '../lib/supabase'

export async function getStudentAttemptReviewAccess() {
  const { data, error } = await supabase.rpc('get_student_attempt_review_access')
  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function getStudentAttemptReview(assessmentType, attemptId) {
  const { data, error } = await supabase.rpc('get_student_attempt_review', {
    p_assessment_type: assessmentType,
    p_attempt_id: attemptId,
  })
  if (error) throw error
  if (!data || data.assessmentType !== assessmentType || String(data.attempt?.id) !== String(attemptId)) {
    throw new Error('Review is unavailable for this attempt.')
  }
  return data
}
