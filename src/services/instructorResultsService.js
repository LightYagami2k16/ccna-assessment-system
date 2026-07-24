import { supabase } from '../lib/supabase'

export async function getInstructorAttempts() {
  const { data, error } = await supabase.rpc('get_instructor_attempts')
  if (error) throw error
  return data ?? []
}

export async function getInstructorAttemptDetail(attemptId) {
  const { data, error } = await supabase.rpc(
    'get_instructor_attempt_detail',
    { p_attempt_id: attemptId },
  )
  if (error) throw error
  return data
}
