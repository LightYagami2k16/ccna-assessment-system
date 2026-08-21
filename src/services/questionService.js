/*import { supabase } from '../lib/supabase'

export async function getCourses() {
  const { data, error } = await supabase
    .from('courses')
    .select('id, code, title')
    .eq('is_active', true)
    .order('code')

  if (error) throw error
  return data ?? []
}

export async function getModules(courseId) {
  if (!courseId) return []

  const { data, error } = await supabase
    .from('modules')
    .select('id, code, title, course_id')
    .eq('course_id', courseId)
    .order('sort_order')

  if (error) throw error
  return data ?? []
}

export async function getInstructorQuestions() {
  const { data, error } = await supabase
    .from('questions')
    .select(`
      id,
      course_id,
      module_id,
      title,
      question_text,
      explanation,
      question_type,
      points,
      difficulty,
      status,
      created_at,
      courses (id, code, title),
      modules (id, code, title),
      question_options (
        id,
        option_text,
        is_correct,
        sort_order
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((question) => ({
    ...question,
    question_options: [...(question.question_options ?? [])].sort(
      (left, right) => left.sort_order - right.sort_order,
    ),
  }))
}

export async function createQuestion({
  courseId,
  moduleId,
  createdBy,
  questionType,
  title,
  questionText,
  explanation,
  points,
  difficulty,
  status,
  options,
}) {
  const { data: question, error: questionError } = await supabase
    .from('questions')
    .insert({
      course_id: courseId,
      module_id: moduleId || null,
      created_by: createdBy,
      question_type: questionType,
      title,
      question_text: questionText,
      explanation: explanation || null,
      points,
      difficulty,
      status,
    })
    .select('id')
    .single()

  if (questionError) throw questionError

  const optionRows = options.map((option, index) => ({
    question_id: question.id,
    option_text: option.optionText,
    is_correct: option.isCorrect,
    sort_order: index,
  }))

  const { error: optionsError } = await supabase
    .from('question_options')
    .insert(optionRows)

  if (optionsError) {
    await supabase.from('questions').delete().eq('id', question.id)
    throw optionsError
  }

  return question
}

export async function deleteQuestion(questionId) {
  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('id', questionId)

  if (error) throw error
}

export async function deleteQuestions(questionIds) {
  const { data, error } = await supabase.rpc(
    'delete_instructor_questions_bulk',
    { p_question_ids: questionIds },
  )
  if (error) throw error
  return data
}

export async function updateQuestion(payload) {
  const { data, error } = await supabase.rpc('update_instructor_question', {
    p_payload: payload,
  })
  if (error) throw error
  return data
}

export async function setQuestionStatus(questionId, status) {
  const { data, error } = await supabase.rpc(
    'set_instructor_question_status',
    {
      p_question_id: questionId,
      p_status: status,
    },
  )
  if (error) throw error
  return data
}

export async function setQuestionsStatus(questionIds, status) {
  const { data, error } = await supabase.rpc(
    'set_instructor_questions_status_bulk',
    {
      p_question_ids: questionIds,
      p_status: status,
    },
  )
  if (error) throw error
  return data
}

export async function importQuestionBank(payload) {
  const { data, error } = await supabase.rpc(
    'import_instructor_question_bank',
    { p_payload: payload },
  )
  if (error) throw error
  return data
}
*/

import { supabase } from '../lib/supabase'

export async function getCourses() {
  const { data, error } = await supabase
    .from('courses')
    .select('id, code, title')
    .eq('is_active', true)
    .order('code')

  if (error) throw error
  return data ?? []
}

export async function getModules(courseId) {
  if (!courseId) return []

  const { data, error } = await supabase
    .from('modules')
    .select('id, code, title, course_id')
    .eq('course_id', courseId)
    .order('sort_order')

  if (error) throw error
  return data ?? []
}

export async function getInstructorQuestions() {
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
        explanation,
        question_type,
        points,
        difficulty,
        status,
        created_at,
        courses (id, code, title),
        modules (id, code, title),
        question_options (
          id,
          option_text,
          is_correct,
          sort_order
        )
      `)
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

  return allQuestions.map((question) => ({
    ...question,
    question_options: [...(question.question_options ?? [])].sort(
      (left, right) => left.sort_order - right.sort_order,
    ),
  }))
}

export async function createQuestion({
  courseId,
  moduleId,
  createdBy,
  questionType,
  title,
  questionText,
  explanation,
  points,
  difficulty,
  status,
  options,
}) {
  const { data: question, error: questionError } = await supabase
    .from('questions')
    .insert({
      course_id: courseId,
      module_id: moduleId || null,
      created_by: createdBy,
      question_type: questionType,
      title,
      question_text: questionText,
      explanation: explanation || null,
      points,
      difficulty,
      status,
    })
    .select('id')
    .single()

  if (questionError) throw questionError

  const optionRows = options.map((option, index) => ({
    question_id: question.id,
    option_text: option.optionText,
    is_correct: option.isCorrect,
    sort_order: index,
  }))

  const { error: optionsError } = await supabase
    .from('question_options')
    .insert(optionRows)

  if (optionsError) {
    await supabase.from('questions').delete().eq('id', question.id)
    throw optionsError
  }

  return question
}

export async function deleteQuestion(questionId) {
  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('id', questionId)

  if (error) throw error
}

export async function deleteQuestions(questionIds) {
  const { data, error } = await supabase.rpc(
    'delete_instructor_questions_bulk',
    { p_question_ids: questionIds },
  )

  if (error) throw error
  return data
}

export async function updateQuestion(payload) {
  const { data, error } = await supabase.rpc(
    'update_instructor_question',
    {
      p_payload: payload,
    },
  )

  if (error) throw error
  return data
}

export async function setQuestionStatus(questionId, status) {
  const { data, error } = await supabase.rpc(
    'set_instructor_question_status',
    {
      p_question_id: questionId,
      p_status: status,
    },
  )

  if (error) throw error
  return data
}

export async function setQuestionsStatus(questionIds, status) {
  const { data, error } = await supabase.rpc(
    'set_instructor_questions_status_bulk',
    {
      p_question_ids: questionIds,
      p_status: status,
    },
  )

  if (error) throw error
  return data
}

export async function importQuestionBank(payload) {
  const { data, error } = await supabase.rpc(
    'import_instructor_question_bank',
    {
      p_payload: payload,
    },
  )

  if (error) throw error
  return data
             }
