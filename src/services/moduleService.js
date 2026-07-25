import { supabase } from '../lib/supabase'

export async function getInstructorModuleWorkspace() {
  const [{ data: courses, error: coursesError }, { data: modules, error: modulesError }] =
    await Promise.all([
      supabase
        .from('courses')
        .select('id, code, title')
        .eq('is_active', true)
        .order('code'),
      supabase
        .from('modules')
        .select('id, course_id, code, title, description, sort_order')
        .order('sort_order')
        .order('code'),
    ])

  if (coursesError) throw coursesError
  if (modulesError) throw modulesError

  return {
    courses: courses ?? [],
    modules: modules ?? [],
  }
}

export async function saveInstructorModule(payload) {
  const { data, error } = await supabase.rpc(
    'save_instructor_module',
    { p_payload: payload },
  )
  if (error) throw error
  return data
}

export async function deleteInstructorModule(moduleId) {
  const { data, error } = await supabase.rpc(
    'delete_instructor_module',
    { p_module_id: moduleId },
  )
  if (error) throw error
  return data
}
