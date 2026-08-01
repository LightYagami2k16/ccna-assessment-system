import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acquireAssessmentTabLock,
  assessmentLockName,
} from './assessmentTabLock.js'

test('builds a separate lock name for every assessment attempt', () => {
  assert.equal(
    assessmentLockName('quiz', 'attempt-1'),
    'ccna-assessment:quiz:attempt-1',
  )
  assert.notEqual(
    assessmentLockName('quiz', 'attempt-1'),
    assessmentLockName('cli', 'attempt-1'),
  )
})

test('falls back to the server lease when Web Locks are unavailable', async () => {
  const result = await acquireAssessmentTabLock({
    assessmentType: 'quiz',
    attemptId: 'attempt-1',
    lockManager: null,
  })

  assert.equal(result.acquired, true)
  assert.equal(result.supported, false)
})

test('blocks a second tab when the local assessment lock is occupied', async () => {
  const result = await acquireAssessmentTabLock({
    assessmentType: 'quiz',
    attemptId: 'attempt-1',
    lockManager: {
      request(_name, _options, callback) {
        return Promise.resolve(callback(null))
      },
    },
  })

  assert.equal(result.acquired, false)
  assert.equal(result.supported, true)
})

test('holds an acquired lock until the assessment releases it', async () => {
  let callbackFinished = false
  const result = await acquireAssessmentTabLock({
    assessmentType: 'cli',
    attemptId: 'attempt-2',
    lockManager: {
      async request(_name, _options, callback) {
        await callback({ name: 'assessment-lock' })
        callbackFinished = true
      },
    },
  })

  assert.equal(result.acquired, true)
  assert.equal(callbackFinished, false)
  result.release()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(callbackFinished, true)
})
