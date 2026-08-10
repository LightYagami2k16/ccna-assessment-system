import { supabase } from '../lib/supabase'

export async function exportInstructorContentBackup() {
  const { data, error } = await supabase.rpc(
    'get_instructor_content_backup',
  )
  if (error) throw error
  return data
}

export async function restoreInstructorContentBackup(payload) {
  const { data, error } = await supabase.rpc(
    'restore_instructor_content_backup',
    { p_payload: payload },
  )
  if (error) throw error
  return data
}

