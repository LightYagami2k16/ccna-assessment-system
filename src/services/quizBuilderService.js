import { supabase } from '../lib/supabase'

export async function getInstructorQuizzes() {
  const { data, error } = await supabase
    .from('quizzes')
    .select(`
      id,
      course_id,
      module_id,
      title,
      description,
      instructions,
      status,
      passing_score,
      randomize_questions,
      randomize_options,
      question_selection_mode,
      random_question_count,
      duration_minutes,
      max_attempts,
      show_results_immediately,
      available_from,
      available_until,
      created_at,
      courses (id, code, title),
      modules (id, code, title),
      quiz_questions (question_id, sort_order)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((quiz) => ({
    ...quiz,
    quiz_questions: [...(quiz.quiz_questions ?? [])].sort(
      (left, right) => left.sort_order - right.sort_order,
    ),
  }))
}

export async function getQuizBuilderQuestions() {
  const { data, error } = await supabase
    .from('questions')
    .select(`
      id,
      course_id,
      module_id,
      title,
      question_text,
      question_type,
      points,
      difficulty,
      status,
      modules (id, code, title)
    `)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function saveInstructorQuiz(payload) {
  const { data, error } = await supabase.rpc('save_instructor_quiz', {
    p_payload: payload,
  })

  if (error) throw error
  return data
}

export async function deleteInstructorQuiz(quizId) {
  const { data, error } = await supabase.rpc('delete_instructor_quiz', {
    p_quiz_id: quizId,
  })

  if (error) throw error
  return data
}

export async function deleteInstructorQuizzes(quizIds) {
  const { data, error } = await supabase.rpc(
    'delete_instructor_quizzes_bulk',
    { p_quiz_ids: quizIds },
  )

  if (error) throw error
  return data
}

export async function setInstructorQuizStatus(quizId, status) {
  const { data, error } = await supabase.rpc('set_instructor_quiz_status', {
    p_quiz_id: quizId,
    p_status: status,
  })
  if (error) throw error
  return data
}

export async function setInstructorQuizzesStatus(quizIds, status) {
  const { data, error } = await supabase.rpc(
    'set_instructor_quizzes_status_bulk',
    {
      p_quiz_ids: quizIds,
      p_status: status,
    },
  )
  if (error) throw error
  return data
}
