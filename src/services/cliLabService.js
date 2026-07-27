import { supabase } from '../lib/supabase'

export async function getInstructorCliWorkspace() {
  const { data, error } = await supabase.rpc('get_instructor_cli_workspace')
  if (error) throw error
  return data ?? { labs: [], classes: [] }
}

export async function saveCliLab(payload) {
  const { data, error } = await supabase.rpc('save_cli_lab', { p_payload: payload })
  if (error) throw error
  return data
}

export async function deleteCliLab(labId) {
  const { data, error } = await supabase.rpc('delete_cli_lab', { p_lab_id: labId })
  if (error) throw error
  return data
}

export async function bulkManageCliLabs(labIds, action) {
  const { data, error } = await supabase.rpc('bulk_manage_cli_labs', {
    p_lab_ids: labIds,
    p_action: action,
  })
  if (error) throw error
  return data
}

export async function getAvailableCliLabs() {
  const { data, error } = await supabase.rpc('get_available_cli_labs')
  if (error) throw error
  return data ?? []
}

export async function startCliAttempt(labId) {
  const { data, error } = await supabase.rpc('start_cli_attempt', { p_lab_id: labId })
  if (error) throw error
  return data
}

export async function getCliAttempt(attemptId) {
  const { data, error } = await supabase.rpc('get_cli_attempt_safe', {
    p_attempt_id: attemptId,
  })
  if (error) throw error
  return data
}

export async function saveCliCommand(payload) {
  const { data, error } = await supabase.rpc('save_cli_command', {
    p_attempt_id: payload.attemptId,
    p_command: payload.command,
    p_mode_before: payload.modeBefore,
    p_mode_after: payload.modeAfter,
    p_accepted: payload.accepted,
    p_output: payload.output,
    p_state: payload.state,
  })
  if (error) throw error
  return data
}

export async function submitCliAttempt(attemptId) {
  const { data, error } = await supabase.rpc('submit_cli_attempt', {
    p_attempt_id: attemptId,
  })
  if (error) throw error
  return data
}

export async function getStudentCliHistory(limit = 50) {
  const { data, error } = await supabase.rpc(
    'get_student_cli_history',
    { p_limit: limit },
  )
  if (error) throw error
  return data ?? []
}

export async function getInstructorCliResults() {
  const { data, error } = await supabase.rpc(
    'get_instructor_cli_results',
  )
  if (error) throw error
  return data ?? []
}

export async function getInstructorCliAttemptReview(attemptId) {
  const { data, error } = await supabase.rpc(
    'get_instructor_cli_attempt_review',
    { p_attempt_id: attemptId },
  )
  if (error) throw error
  return data
}

export async function resetInstructorCliAttempts(attemptIds) {
  const { data, error } = await supabase.rpc(
    'reset_instructor_cli_attempts',
    { p_attempt_ids: attemptIds },
  )
  if (error) throw error
  return data
}
