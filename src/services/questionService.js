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
  const { data, error } = await supabase
    .from('questions')
    .select(`
      id,
      title,
      question_text,
      question_type,
      points,
      difficulty,
      status,
      created_at,
      courses (id, code, title),
      modules (id, code, title)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
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
