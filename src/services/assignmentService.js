import { supabase } from '../lib/supabase'

export async function getAssignmentWorkspace() {
  const { data, error } = await supabase.rpc('get_assignment_workspace')
  if (error) throw error
  return {
    students: data?.students ?? [],
    classes: data?.classes ?? [],
    quizzes: data?.quizzes ?? [],
  }
}

export async function saveClassSection(payload) {
  const { data, error } = await supabase.rpc('save_class_section', {
    p_payload: payload,
  })
  if (error) throw error
  return data
}

export async function deleteClassSection(classId) {
  const { data, error } = await supabase.rpc('delete_class_section', {
    p_class_id: classId,
  })
  if (error) throw error
  return data
}

export async function saveQuizAccess({ quizId, accessMode, classIds }) {
  const { data, error } = await supabase.rpc('save_quiz_access', {
    p_quiz_id: quizId,
    p_access_mode: accessMode,
    p_class_ids: classIds,
  })
  if (error) throw error
  return data
}
