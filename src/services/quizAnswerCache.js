const CACHE_PREFIX = 'ccna-quiz-attempt:'

function cacheKey(attemptId) {
  return `${CACHE_PREFIX}${attemptId}`
}

function readCache(attemptId) {
  try {
    const value = window.localStorage.getItem(cacheKey(attemptId))
    return value
      ? JSON.parse(value)
      : { snapshot: null, pendingAnswers: {}, updatedAt: null }
  } catch {
    return { snapshot: null, pendingAnswers: {}, updatedAt: null }
  }
}

function writeCache(attemptId, cache) {
  try {
    window.localStorage.setItem(
      cacheKey(attemptId),
      JSON.stringify({
        ...cache,
        updatedAt: new Date().toISOString(),
      }),
    )
    return true
  } catch {
    return false
  }
}

export function saveAttemptSnapshot(attemptId, snapshot) {
  const cache = readCache(attemptId)
  return writeCache(attemptId, {
    ...cache,
    snapshot,
  })
}

export function getAttemptSnapshot(attemptId) {
  return readCache(attemptId).snapshot
}

export function updateSnapshotAnswer(
  attemptId,
  attemptQuestionId,
  answer,
) {
  const cache = readCache(attemptId)
  if (!cache.snapshot) return false

  return writeCache(attemptId, {
    ...cache,
    snapshot: {
      ...cache.snapshot,
      questions: (cache.snapshot.questions ?? []).map((question) =>
        question.attemptQuestionId === attemptQuestionId
          ? { ...question, ...answer }
          : question,
      ),
    },
  })
}

export function cachePendingAnswer(
  attemptId,
  attemptQuestionId,
  answer,
) {
  const cache = readCache(attemptId)
  return writeCache(attemptId, {
    ...cache,
    pendingAnswers: {
      ...cache.pendingAnswers,
      [attemptQuestionId]: {
        ...answer,
        savedAt: new Date().toISOString(),
      },
    },
  })
}

export function getPendingAnswers(attemptId) {
  return readCache(attemptId).pendingAnswers ?? {}
}

export function markPendingAnswerSynced(attemptId, attemptQuestionId) {
  const cache = readCache(attemptId)
  const pendingAnswers = { ...cache.pendingAnswers }
  delete pendingAnswers[attemptQuestionId]
  return writeCache(attemptId, {
    ...cache,
    pendingAnswers,
  })
}

export function clearAttemptCache(attemptId) {
  try {
    window.localStorage.removeItem(cacheKey(attemptId))
  } catch {
    // Local storage may be unavailable in a restricted browser.
  }
}
