import { supabase } from '../lib/supabase'

function stableOrderValue(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export async function getAvailableQuizzes() {
  const { data, error } = await supabase
    .from('quizzes')
    .select(`
      id, title, description, instructions, duration_minutes, max_attempts,
      passing_score, available_from, available_until, show_results_immediately,
      randomize_questions, randomize_options, created_at,
      courses (id, code, title),
      modules (id, code, title)
    `)
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  if (error) throw error

  const now = Date.now()
  return (data ?? []).filter((quiz) => {
    const startsAt = quiz.available_from
      ? new Date(quiz.available_from).getTime()
      : null
    const endsAt = quiz.available_until
      ? new Date(quiz.available_until).getTime()
      : null
    return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now)
  })
}

export async function getStudentAttempts() {
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

export async function startQuizAttempt(quizId) {
  const { data, error } = await supabase.rpc('start_quiz_attempt', {
    p_quiz_id: quizId,
  })
  if (error) throw error
  return data
}

export async function getQuizAttempt(attemptId) {
  const { data, error } = await supabase.rpc('get_quiz_attempt_safe', {
    p_attempt_id: attemptId,
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
  selectedOptionId,
}) {
  const { data, error } = await supabase.rpc('save_quiz_answer', {
    p_attempt_id: attemptId,
    p_attempt_question_id: attemptQuestionId,
    p_selected_option_id: selectedOptionId,
  })
  if (error) throw error
  return data
}

export async function submitQuizAttempt(attemptId) {
  const { data, error } = await supabase.rpc('submit_quiz_attempt', {
    p_attempt_id: attemptId,
  })
  if (error) throw error
  return data
}
