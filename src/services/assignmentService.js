import { supabase } from '../lib/supabase'

export async function getAssignmentWorkspace() {
  const { data, error } = await supabase.rpc('get_assignment_workspace')
  if (error) throw error
  return {
    students: data?.students ?? [],
    classes: data?.classes ?? [],
    approvalRequests: data?.approvalRequests ?? [],
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

export async function deleteClassSections(classIds) {
  const { data, error } = await supabase.rpc(
    'delete_class_sections_bulk',
    { p_class_ids: classIds },
  )
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

export async function generateClassJoinCode(classId = null) {
  const { data, error } = await supabase.rpc('generate_class_join_code', {
    p_class_id: classId,
  })
  if (error) throw error
  return data
}

export async function addStudentToClassByEmail({ classId, email }) {
  const { data, error } = await supabase.rpc(
    'add_student_to_class_by_email',
    {
      p_class_id: classId,
      p_email: email,
    },
  )
  if (error) throw error
  return data
}

export async function reviewClassJoinRequest({ requestId, decision }) {
  const { data, error } = await supabase.rpc(
    'review_class_join_request',
    {
      p_request_id: requestId,
      p_decision: decision,
    },
  )
  if (error) throw error
  return data
}

export async function requestClassJoin(joinCode) {
  const { data, error } = await supabase.rpc('request_class_join', {
    p_join_code: joinCode,
  })
  if (error) throw error
  return data
}

export async function getStudentClassEnrollment() {
  const { data, error } = await supabase.rpc(
    'get_student_class_enrollment',
  )
  if (error) throw error
  return {
    classes: data?.classes ?? [],
    requests: data?.requests ?? [],
  }
}
