import { supabase } from '../lib/supabase'

async function throwFunctionError(error, fallbackMessage) {
  const response = error?.context

  if (response && typeof response.json === 'function') {
    let payload = null

    try {
      payload = await response.json()
    } catch {
      // Use the normal function error when no JSON body is available.
    }

    if (payload?.error || payload?.message) {
      throw new Error(payload.error || payload.message)
    }
  }

  throw new Error(error?.message || fallbackMessage)
}

export async function getAssignmentWorkspace() {
  const [
    { data, error },
    { data: classCourseContexts },
  ] = await Promise.all([
    supabase.rpc('get_assignment_workspace'),
    supabase.rpc('get_instructor_class_course_context'),
  ])
  if (error) throw error
  const courseCodesByClass = new Map(
    (classCourseContexts ?? []).map((context) => [
      context.classId,
      context.courseCodes ?? [],
    ]),
  )
  return {
    students: data?.students ?? [],
    classes: (data?.classes ?? []).map((classSection) => ({
      ...classSection,
      courseCodes: courseCodesByClass.get(classSection.id) ?? [],
    })),
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

export async function resetClassStudentPassword({
  classId,
  studentId,
}) {
  const { data, error } = await supabase.functions.invoke(
    'admin-user-security',
    {
      body: {
        action: 'reset_class_student_password',
        classId,
        studentId,
      },
    },
  )

  if (error) {
    await throwFunctionError(
      error,
      'Unable to reset the student password.',
    )
  }
  if (data?.error) throw new Error(data.error)

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

export async function reviewClassJoinRequestsBulk({
  requestIds,
  decision = 'approved',
}) {
  const uniqueRequestIds = [...new Set(requestIds)].filter(Boolean)
  const successfulIds = []
  const failures = []

  for (const requestId of uniqueRequestIds) {
    try {
      await reviewClassJoinRequest({ requestId, decision })
      successfulIds.push(requestId)
    } catch (error) {
      failures.push({
        requestId,
        message: error?.message || 'Unable to review this request.',
      })
    }
  }

  return { successfulIds, failures }
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
    classes: (data?.classes ?? []).filter(
      (classSection) => classSection.isActive !== false,
    ),
    requests: (data?.requests ?? []).filter(
      (request) => request.isActive !== false,
    ),
  }
}
