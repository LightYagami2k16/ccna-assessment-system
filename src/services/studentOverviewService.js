import { supabase } from '../lib/supabase'
import { getAvailableQuizzes, getStudentQuizArchiveStatuses } from './quizAttemptService'
import { getStudentCliArchiveStatuses } from './cliLabService'
import { reconcileExpiredAssessmentAttempts } from './assessmentAttemptService'
import { readyPracticals, readyQuizzes, upcomingAssessments } from './studentOverviewModel'

function array(value) {
  if (!Array.isArray(value)) throw new Error('Assessment summary is unavailable.')
  return value
}

export async function getOverviewQuizzes() {
  const [quizzes, statuses] = await Promise.all([getAvailableQuizzes(), getStudentQuizArchiveStatuses()])
  return readyQuizzes(array(quizzes), array(statuses))
}

async function listPracticals() {
  await reconcileExpiredAssessmentAttempts()
  // The overview needs titles and lifecycle data, not device/topology payloads.
  const { data, error } = await supabase.rpc('get_available_cli_labs')
  if (error) throw error
  return array(data ?? [])
}

export async function getOverviewPracticals() {
  const [practicals, statuses] = await Promise.all([listPracticals(), getStudentCliArchiveStatuses()])
  return readyPracticals(practicals, array(statuses))
}

export async function getOverviewUpcoming() {
  const { data, error } = await supabase.rpc('get_student_upcoming_assessments')
  if (error) throw error
  return upcomingAssessments(array(data ?? []))
}
