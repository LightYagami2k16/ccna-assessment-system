import { supabase } from '../lib/supabase'
import { reconcileExpiredAssessmentAttempts } from './assessmentAttemptService'

export async function getExamControlsWorkspace() {
  await reconcileExpiredAssessmentAttempts()

  const [
    { data, error },
    { data: cliAttempts, error: cliError },
    { data: classContexts },
  ] = await Promise.all([
    supabase.rpc('get_exam_controls_workspace'),
    supabase.rpc('get_cli_live_monitoring_attempts'),
    supabase.rpc('get_live_attempt_class_context'),
  ])
  if (error) throw error
  if (cliError) throw cliError
  const classContextByAttempt = new Map(
    (classContexts ?? []).map((context) => [
      `${context.assessmentType}:${context.attemptId}`,
      context,
    ]),
  )
  const withClassContext = (attempt) => ({
    ...attempt,
    ...(
      classContextByAttempt.get(
        `${attempt.assessmentType}:${attempt.attemptId}`,
      ) ?? {}
    ),
  })
  return {
    students: data?.students ?? [],
    quizzes: data?.quizzes ?? [],
    assignments: data?.assignments ?? [],
    accommodations: data?.accommodations ?? [],
    activeAttempts: [
      ...(data?.activeAttempts ?? []).map((attempt) => ({
        ...attempt,
        assessmentType: 'quiz',
        assessmentTitle: attempt.quizTitle,
      })),
      ...(cliAttempts ?? []),
    ].filter(
      (attempt) =>
        !attempt.expiresAt ||
        new Date(attempt.expiresAt).getTime() > Date.now(),
    ).map(withClassContext).sort(
      (left, right) =>
        new Date(right.startedAt).getTime() -
        new Date(left.startedAt).getTime(),
    ),
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
  attemptType = 'quiz',
  eventType,
  details = {},
}) {
  const { data, error } = await supabase.rpc(
    attemptType === 'cli'
      ? 'record_cli_integrity_event'
      : 'record_exam_integrity_event',
    {
      p_attempt_id: attemptId,
      p_event_type: eventType,
      p_details: details,
    },
  )
  if (error) throw error
  return data
}
