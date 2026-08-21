/*
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

export async function getInstructorQuizTemplates() {
  const { data, error } = await supabase
    .from('quiz_templates')
    .select(`
      id,
      source_quiz_id,
      course_id,
      module_id,
      name,
      template_data,
      created_at,
      courses (id, code, title),
      modules (id, code, title)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function duplicateInstructorQuiz(quizId, title = null) {
  const { data, error } = await supabase.rpc(
    'duplicate_instructor_quiz',
    { p_quiz_id: quizId, p_title: title },
  )

  if (error) throw error
  return data
}

export async function saveQuizAsTemplate(quizId, name = null) {
  const { data, error } = await supabase.rpc(
    'save_instructor_quiz_template',
    { p_quiz_id: quizId, p_name: name },
  )

  if (error) throw error
  return data
}

export async function createQuizFromTemplate(templateId, title = null) {
  const { data, error } = await supabase.rpc(
    'create_instructor_quiz_from_template',
    { p_template_id: templateId, p_title: title },
  )

  if (error) throw error
  return data
}

export async function deleteQuizTemplate(templateId) {
  const { data, error } = await supabase.rpc(
    'delete_instructor_quiz_template',
    { p_template_id: templateId },
  )

  if (error) throw error
  return data
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
*/

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
  const PAGE_SIZE = 1000
  let allQuestions = []
  let from = 0

  while (true) {
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
        created_at,
        modules (id, code, title)
      `)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error

    const batch = data ?? []

    if (batch.length === 0) {
      break
    }

    allQuestions.push(...batch)

    if (batch.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return allQuestions
}

export async function getInstructorQuizTemplates() {
  const { data, error } = await supabase
    .from('quiz_templates')
    .select(`
      id,
      source_quiz_id,
      course_id,
      module_id,
      name,
      template_data,
      created_at,
      courses (id, code, title),
      modules (id, code, title)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function duplicateInstructorQuiz(quizId, title = null) {
  const { data, error } = await supabase.rpc(
    'duplicate_instructor_quiz',
    { p_quiz_id: quizId, p_title: title },
  )

  if (error) throw error
  return data
}

export async function saveQuizAsTemplate(quizId, name = null) {
  const { data, error } = await supabase.rpc(
    'save_instructor_quiz_template',
    { p_quiz_id: quizId, p_name: name },
  )

  if (error) throw error
  return data
}

export async function createQuizFromTemplate(templateId, title = null) {
  const { data, error } = await supabase.rpc(
    'create_instructor_quiz_from_template',
    { p_template_id: templateId, p_title: title },
  )

  if (error) throw error
  return data
}

export async function deleteQuizTemplate(templateId) {
  const { data, error } = await supabase.rpc(
    'delete_instructor_quiz_template',
    { p_template_id: templateId },
  )

  if (error) throw error
  return data
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
  const { data, error } = await supabase.rpc(
    'set_instructor_quiz_status',
    {
      p_quiz_id: quizId,
      p_status: status,
    },
  )

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
