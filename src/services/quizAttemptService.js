import { supabase } from '../lib/supabase'
import { reconcileExpiredAssessmentAttempts } from './assessmentAttemptService'

function stableOrderValue(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export async function getAvailableQuizzes() {
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase.rpc(
    'get_available_quizzes_for_student',
  )

  if (error) throw error

  return data ?? []
}

export async function getStudentAttempts() {
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase
    .from('quiz_attempts')
    .select(`
      id, quiz_id, attempt_number, status, started_at, expires_at,
      submitted_at, score_points, maximum_points, percentage, passed
    `)
    .order('started_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getStudentRecentResults(limit = 10) {
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase.rpc(
    'get_student_recent_quiz_results',
    {
      p_limit: limit,
    },
  )
  if (error) throw error
  return data ?? []
}

export async function getStudentQuizArchiveStatuses() {
  const { data, error } = await supabase.rpc(
    'get_student_quiz_archive_statuses',
  )
  if (error) throw error
  return data ?? []
}

export async function setStudentQuizArchived(quizId, archived) {
  const { data, error } = await supabase.rpc(
    'set_student_quiz_archived',
    {
      p_quiz_id: quizId,
      p_archived: archived,
    },
  )
  if (error) throw error
  return data
}

export async function startQuizAttempt(quizId) {
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase.rpc('start_quiz_attempt', {
    p_quiz_id: quizId,
  })
  if (error) throw error
  return data
}

export async function getQuizAttempt(attemptId, clientId) {
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase.rpc('get_quiz_attempt_safe_v2', {
    p_attempt_id: attemptId,
    p_client_id: clientId,
  })
  if (error) throw error

  if (data?.attempt?.quizId) {
    const { data: quizSettings, error: settingsError } = await supabase
      .from('quizzes')
      .select('randomize_options')
      .eq('id', data.attempt.quizId)
      .single()

    if (settingsError) throw settingsError

    if (quizSettings.randomize_options) {
      data.questions = (data.questions ?? []).map((question) => ({
        ...question,
        options: [...(question.options ?? [])].sort(
          (left, right) =>
            stableOrderValue(`${attemptId}:${question.questionId}:${left.id}`) -
            stableOrderValue(`${attemptId}:${question.questionId}:${right.id}`),
        ),
      }))
    }
  }

  return data
}

export async function saveQuizAnswer({
  attemptId,
  attemptQuestionId,
  selectedOptionId = null,
  selectedOptionIds = [],
  answerText = null,
  clientId,
}) {
  const optionIds = selectedOptionIds.length
    ? selectedOptionIds
    : selectedOptionId
      ? [selectedOptionId]
      : []

  const { data, error } = await supabase.rpc('save_quiz_answer_v3', {
    p_attempt_id: attemptId,
    p_attempt_question_id: attemptQuestionId,
    p_selected_option_ids: optionIds,
    p_answer_text: answerText,
    p_client_id: clientId,
  })
  if (error) throw error
  return data
}

export async function recordQuizQuestionTime({
  attemptId,
  attemptQuestionId,
  elapsedSeconds,
  clientId,
}) {
  const { data, error } = await supabase.rpc(
    'record_quiz_question_time',
    {
      p_attempt_id: attemptId,
      p_attempt_question_id: attemptQuestionId,
      p_elapsed_seconds: elapsedSeconds,
      p_client_id: clientId,
    },
  )
  if (error) throw error
  return data
}

export async function submitQuizAttempt(attemptId, clientId) {
  const { data, error } = await supabase.rpc('submit_quiz_attempt_v2', {
    p_attempt_id: attemptId,
    p_client_id: clientId,
  })
  if (error) throw error
  return data
}
