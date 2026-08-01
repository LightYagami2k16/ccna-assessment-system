import { supabase } from '../lib/supabase'

let reconciliationPromise = null

function migrationIsUnavailable(error) {
  return (
    error?.code === 'PGRST202' ||
    error?.code === '42883' ||
    error?.message
      ?.toLowerCase()
      .includes('reconcile_expired_assessment_attempts')
  )
}

export async function reconcileExpiredAssessmentAttempts() {
  if (reconciliationPromise) return reconciliationPromise

  reconciliationPromise = (async () => {
    const { data, error } = await supabase.rpc(
      'reconcile_expired_assessment_attempts',
    )

    if (error) {
      if (migrationIsUnavailable(error)) {
        return {
          migrationRequired: true,
          quizAttemptsFinalized: 0,
          cliAttemptsFinalized: 0,
        }
      }
      throw error
    }

    return data ?? {
      quizAttemptsFinalized: 0,
      cliAttemptsFinalized: 0,
    }
  })()

  try {
    return await reconciliationPromise
  } finally {
    reconciliationPromise = null
  }
}

export async function getStudentActiveAssessmentSession() {
  await reconcileExpiredAssessmentAttempts()

  const { data, error } = await supabase.rpc(
    'get_student_active_assessment_session',
  )

  if (error) {
    if (
      error.code === 'PGRST202'
      || error.code === '42883'
      || error.message
        ?.toLowerCase()
        .includes('get_student_active_assessment_session')
    ) {
      return null
    }
    throw error
  }

  return data ?? null
}
