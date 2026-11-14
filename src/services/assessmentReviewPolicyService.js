import { supabase } from '../lib/supabase'

function policy(data) {
  if (typeof data?.allowReview !== 'boolean') throw new Error('Review settings are unavailable.')
  return data
}

export async function getAssessmentReviewPolicy(assessmentType, assessmentId) {
  const { data, error } = await supabase.rpc('get_assessment_review_policy', {
    p_assessment_type: assessmentType,
    p_assessment_id: assessmentId,
  })
  if (error) throw error
  return policy(data)
}

export async function setAssessmentReviewPolicy(assessmentType, assessmentId, allowReview) {
  if (typeof allowReview !== 'boolean') throw new Error('Choose a review access setting.')
  const { data, error } = await supabase.rpc('set_assessment_review_policy', {
    p_assessment_type: assessmentType,
    p_assessment_id: assessmentId,
    p_allow_review: allowReview,
  })
  if (error) throw error
  return policy(data)
}

export async function setAssessmentReviewSchedule(assessmentType, assessmentId, settings) {
  policy(settings)
  const { data, error } = await supabase.rpc('set_assessment_review_schedule', {
    p_assessment_type: assessmentType,
    p_assessment_id: assessmentId,
    p_allow_review: settings.allowReview,
    p_available_from: settings.availableFrom ?? null,
    p_available_until: settings.availableUntil ?? null,
  })
  if (error) throw error
  return policy(data)
}
