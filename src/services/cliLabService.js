import { supabase } from '../lib/supabase'
import { reconcileExpiredAssessmentAttempts } from './assessmentAttemptService'

function defaultDevice(item = {}) {
  return {
    id: 'device-1',
    label: item.initialHostname || 'Device 1',
    hostname: item.initialHostname || 'Switch',
    type: item.deviceType || 'switch',
  }
}

async function attachTopologyData(items = []) {
  if (!items.length) return items
  const { data, error } = await supabase.rpc(
    'get_cli_lab_topology_data',
    { p_lab_ids: items.map((item) => item.id) },
  )
  if (error) {
    if (['42883', 'PGRST202'].includes(error.code)) {
      return items.map((item) => ({
        ...item,
        devices: [defaultDevice(item)],
        topology: { links: [] },
      }))
    }
    throw error
  }
  const topologyById = new Map(
    (data ?? []).map((item) => [String(item.id), item]),
  )
  return items.map((item) => ({
    ...item,
    devices: topologyById.get(String(item.id))?.devices
      ?? [defaultDevice(item)],
    topology: topologyById.get(String(item.id))?.topology
      ?? { links: [] },
  }))
}

export async function getInstructorCliWorkspace() {
  const { data, error } = await supabase.rpc('get_instructor_cli_workspace')
  if (error) throw error
  const workspace = data ?? { labs: [], classes: [] }
  return {
    ...workspace,
    labs: await attachTopologyData(workspace.labs ?? []),
  }
}

export async function getInstructorCliLabTemplates() {
  const { data, error } = await supabase
    .from('cli_lab_templates')
    .select(`
      id,
      source_lab_id,
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

export async function duplicateInstructorCliLab(labId, title = null) {
  const { data, error } = await supabase.rpc(
    'duplicate_instructor_cli_lab',
    { p_lab_id: labId, p_title: title },
  )
  if (error) throw error
  return data
}

export async function saveCliLabAsTemplate(labId, name = null) {
  const { data, error } = await supabase.rpc(
    'save_instructor_cli_lab_template',
    { p_lab_id: labId, p_name: name },
  )
  if (error) throw error
  return data
}

export async function createCliLabFromTemplate(templateId, title = null) {
  const { data, error } = await supabase.rpc(
    'create_instructor_cli_lab_from_template',
    { p_template_id: templateId, p_title: title },
  )
  if (error) throw error
  return data
}

export async function deleteCliLabTemplate(templateId) {
  const { data, error } = await supabase.rpc(
    'delete_instructor_cli_lab_template',
    { p_template_id: templateId },
  )
  if (error) throw error
  return data
}

export async function saveCliLab(payload) {
  const { data, error } = await supabase.rpc('save_cli_lab', { p_payload: payload })
  if (error) throw error
  const { error: topologyError } = await supabase.rpc(
    'save_cli_lab_topology',
    {
      p_lab_id: data,
      p_devices: payload.devices,
      p_topology: payload.topology ?? { links: [] },
    },
  )
  if (topologyError) {
    topologyError.message = `${topologyError.message} Install migration 036 to save multi-device practicals.`
    throw topologyError
  }
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
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase.rpc('get_available_cli_labs')
  if (error) throw error
  return attachTopologyData(data ?? [])
}

export async function startCliAttempt(labId) {
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase.rpc('start_cli_attempt', { p_lab_id: labId })
  if (error) throw error
  return data
}

export async function getCliAttempt(attemptId, clientId) {
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase.rpc('get_cli_attempt_safe_v2', {
    p_attempt_id: attemptId,
    p_client_id: clientId,
  })
  if (error) throw error
  const [labWithTopology] = await attachTopologyData([data.lab])
  return {
    ...data,
    lab: labWithTopology,
    commands: (data.commands ?? []).map((item) => ({
      ...item,
      deviceId: item.deviceId ?? 'device-1',
    })),
  }
}

export async function saveCliCommand(payload) {
  const { data, error } = await supabase.rpc('save_cli_device_command_v2', {
    p_attempt_id: payload.attemptId,
    p_device_id: payload.deviceId ?? 'device-1',
    p_command: payload.command,
    p_mode_before: payload.modeBefore,
    p_mode_after: payload.modeAfter,
    p_accepted: payload.accepted,
    p_output: payload.output,
    p_state: payload.state,
    p_client_id: payload.clientId,
  })
  if (error) throw error
  return data
}

export async function submitCliAttempt(attemptId, clientId) {
  const { data, error } = await supabase.rpc('submit_cli_attempt_v2', {
    p_attempt_id: attemptId,
    p_client_id: clientId,
  })
  if (error) throw error
  return data
}

export async function getStudentCliHistory(limit = 50) {
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase.rpc(
    'get_student_cli_history',
    { p_limit: limit },
  )
  if (error) throw error
  return data ?? []
}

export async function getStudentCliArchiveStatuses() {
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase.rpc(
    'get_student_cli_archive_statuses',
  )
  if (error) throw error
  return data ?? []
}

export async function setStudentCliLabArchived(labId, archived) {
  const { data, error } = await supabase.rpc(
    'set_student_cli_lab_archived',
    { p_lab_id: labId, p_archived: archived },
  )
  if (error) throw error
  return data
}

export async function getInstructorCliResults() {
  await reconcileExpiredAssessmentAttempts()

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
