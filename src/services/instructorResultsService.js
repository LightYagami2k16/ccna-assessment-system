import { supabase } from '../lib/supabase'
import { reconcileExpiredAssessmentAttempts } from './assessmentAttemptService'

export async function getInstructorAttempts() {
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase.rpc('get_instructor_attempts')
  if (error) throw error
  return data ?? []
}

export async function getInstructorAttemptDetail(attemptId) {
  const [detailResponse, timingResponse] = await Promise.all([
    supabase.rpc('get_instructor_attempt_detail', {
      p_attempt_id: attemptId,
    }),
    supabase.rpc('get_instructor_quiz_question_times', {
      p_attempt_id: attemptId,
    }),
  ])

  if (detailResponse.error) throw detailResponse.error
  if (timingResponse.error) throw timingResponse.error

  const timingByQuestion = new Map(
    (timingResponse.data ?? []).map((item) => [
      item.attemptQuestionId,
      Number(item.timeSpentSeconds) || 0,
    ]),
  )

  return {
    ...detailResponse.data,
    questions: (detailResponse.data?.questions ?? []).map(
      (question) => ({
        ...question,
        timeSpentSeconds:
          timingByQuestion.get(question.attemptQuestionId) ?? 0,
      }),
    ),
  }
}

export async function resetInstructorAttempts(attemptIds) {
  const { data, error } = await supabase.rpc(
    'reset_instructor_quiz_attempts',
    { p_attempt_ids: attemptIds },
  )
  if (error) throw error
  return data
}
