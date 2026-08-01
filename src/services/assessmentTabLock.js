export function assessmentLockName(assessmentType, attemptId) {
  return `ccna-assessment:${assessmentType}:${attemptId}`
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

  return new Promise((resolve) => {
    let resolved = false

    lockManager.request(
      assessmentLockName(assessmentType, attemptId),
      { ifAvailable: true, mode: 'exclusive' },
      async (lock) => {
        if (!lock) {
          resolved = true
          resolve({
            acquired: false,
            supported: true,
            release() {},
          })
          return
        }

        let releaseLock
        const lockLifetime = new Promise((release) => {
          releaseLock = release
        })

        resolved = true
        resolve({
          acquired: true,
          supported: true,
          release: releaseLock,
        })

        await lockLifetime
      },
    ).catch(() => {
      if (resolved) return
      resolve({
        acquired: true,
        supported: false,
        release() {},
      })
    })
  })
}
