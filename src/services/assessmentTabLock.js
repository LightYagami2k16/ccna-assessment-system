export function assessmentLockName(assessmentType, attemptId) {
  return `ccna-assessment:${assessmentType}:${attemptId}`
}

// React StrictMode intentionally mounts, cleans up, and mounts effects again in
// development. Keep a lock owned by this browser tab alive through that brief
// cleanup so the remount does not mistake itself for a second tab.
const tabLockEntries = new Map()

function retainTabLock(entry) {
  if (entry.releaseTimer) {
    clearTimeout(entry.releaseTimer)
    entry.releaseTimer = null
  }

  entry.references += 1
  let released = false

  return {
    acquired: true,
    supported: true,
    release() {
      if (released) return
      released = true
      entry.references = Math.max(0, entry.references - 1)

      if (entry.references > 0 || entry.releaseTimer) return

      entry.releaseTimer = setTimeout(() => {
        entry.releaseTimer = null
        if (entry.references > 0) return

        if (tabLockEntries.get(entry.name) === entry) {
          tabLockEntries.delete(entry.name)
        }
        entry.releaseUnderlying?.()
      }, 0)
    },
  }
}

export async function acquireAssessmentTabLock({
  assessmentType,
  attemptId,
  lockManager = globalThis.navigator?.locks,
}) {
  if (!lockManager?.request) {
    return {
      acquired: true,
      supported: false,
      release() {},
    }
  }

  const name = assessmentLockName(assessmentType, attemptId)
  const existingEntry = tabLockEntries.get(name)

  // Entries are shared only inside this JavaScript context (the current tab).
  // Another browser tab has its own module instance and is still rejected by
  // the browser's exclusive Web Lock.
  if (existingEntry?.lockManager === lockManager) {
    const result = await existingEntry.acquisition
    if (result.acquired) return retainTabLock(existingEntry)
  }

  const entry = {
    name,
    lockManager,
    references: 0,
    releaseTimer: null,
    releaseUnderlying: null,
    acquisition: null,
  }
  tabLockEntries.set(name, entry)

  entry.acquisition = new Promise((resolve) => {
    let resolved = false

    lockManager.request(
      name,
      { ifAvailable: true, mode: 'exclusive' },
      async (lock) => {
        if (!lock) {
          resolved = true
          if (tabLockEntries.get(name) === entry) {
            tabLockEntries.delete(name)
          }
          resolve({
            acquired: false,
            supported: true,
          })
          return
        }

        let releaseLock
        const lockLifetime = new Promise((release) => {
          releaseLock = release
        })
        entry.releaseUnderlying = releaseLock

        resolved = true
        resolve({
          acquired: true,
          supported: true,
        })

        await lockLifetime
      },
    ).catch(() => {
      if (resolved) return
      if (tabLockEntries.get(name) === entry) {
        tabLockEntries.delete(name)
      }
      resolve({
        acquired: true,
        supported: false,
      })
    })
  })

  const result = await entry.acquisition

  if (!result.acquired || !result.supported) {
    return {
      ...result,
      release() {},
    }
  }

  return retainTabLock(entry)
}
