import { supabase } from '../lib/supabase'

export async function getExamControlsWorkspace() {
  const { data, error } = await supabase.rpc('get_exam_controls_workspace')
  if (error) throw error
  return {
    students: data?.students ?? [],
    quizzes: data?.quizzes ?? [],
    assignments: data?.assignments ?? [],
    accommodations: data?.accommodations ?? [],
    activeAttempts: data?.activeAttempts ?? [],
  }
}

export async function saveQuizAssignmentSchedule({
  quizId,
  classId,
  availableFrom,
  availableUntil,
}) {
  const { data, error } = await supabase.rpc(
    'save_quiz_assignment_schedule',
    {
      p_quiz_id: quizId,
      p_class_id: classId,
      p_available_from: availableFrom || null,
      p_available_until: availableUntil || null,
    },
  )
  if (error) throw error
  return data
}

export async function saveStudentQuizAccommodation(payload) {
  const { data, error } = await supabase.rpc(
    'save_student_quiz_accommodation',
    { p_payload: payload },
  )
  if (error) throw error
  return data
}

export async function deleteStudentQuizAccommodation(accommodationId) {
  const { data, error } = await supabase.rpc(
    'delete_student_quiz_accommodation',
    { p_accommodation_id: accommodationId },
  )
  if (error) throw error
  return data
}

export async function grantStudentExtraAttempt(quizId, studentId) {
  const { data, error } = await supabase.rpc(
    'grant_student_extra_attempt',
    {
      p_quiz_id: quizId,
      p_student_id: studentId,
    },
  )
  if (error) throw error
  return data
}

export async function recordExamIntegrityEvent({
  attemptId,
  eventType,
  details = {},
}) {
  const { data, error } = await supabase.rpc(
    'record_exam_integrity_event',
    {
      p_attempt_id: attemptId,
      p_event_type: eventType,
      p_details: details,
    },
  )
  if (error) throw error
  return data
}
