import { supabase } from '../lib/supabase'

export async function getInstructorBrowserEvents(attemptId, attemptType) {
  const { data, error } = await supabase.rpc(
    'get_instructor_browser_events',
    {
      p_attempt_id: attemptId,
      p_attempt_type: attemptType,
    },
  )

  if (error) throw error
  return data
}
