const CACHE_PREFIX = 'ccna-cli-attempt:'

function key(attemptId) {
  return `${CACHE_PREFIX}${attemptId}`
}

function emptyCache() {
  return {
    snapshot: null,
    pendingCommands: [],
    pendingSubmission: false,
    updatedAt: null,
  }
}

function read(attemptId) {
  try {
    const raw = window.localStorage.getItem(key(attemptId))
    return raw ? { ...emptyCache(), ...JSON.parse(raw) } : emptyCache()
  } catch {
    return emptyCache()
  }
}

function write(attemptId, value) {
  try {
    window.localStorage.setItem(key(attemptId), JSON.stringify({
      ...value,
      updatedAt: new Date().toISOString(),
    }))
    return true
  } catch {
    return false
  }
}

export function saveCliAttemptSnapshot(attemptId, snapshot) {
  return write(attemptId, { ...read(attemptId), snapshot })
}

export function getCliAttemptSnapshot(attemptId) {
  return read(attemptId).snapshot
}

export function queueCliCommand(attemptId, payload) {
  const cache = read(attemptId)
  return write(attemptId, {
    ...cache,
    pendingCommands: [
      ...cache.pendingCommands,
      {
        id: globalThis.crypto?.randomUUID?.()
          ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        payload,
        queuedAt: new Date().toISOString(),
      },
    ],
  })
}

export function getPendingCliCommands(attemptId) {
  return read(attemptId).pendingCommands ?? []
}

export function removePendingCliCommand(attemptId, commandId) {
  const cache = read(attemptId)
  return write(attemptId, {
    ...cache,
    pendingCommands: cache.pendingCommands.filter(
      (item) => item.id !== commandId,
    ),
  })
}

export function setCliPendingSubmission(attemptId, pending = true) {
  return write(attemptId, {
    ...read(attemptId),
    pendingSubmission: Boolean(pending),
  })
}

export function hasCliPendingSubmission(attemptId) {
  return Boolean(read(attemptId).pendingSubmission)
}

export function clearCliAttemptCache(attemptId) {
  try {
    window.localStorage.removeItem(key(attemptId))
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
}
