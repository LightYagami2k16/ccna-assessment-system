import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyReviewSchedule, reviewScheduleFromPolicy, reviewScheduleToPolicy, validateReviewSchedule } from './reviewSchedule.js'

test('new review schedules default off and disabled/immediate clear bounds', () => {
  assert.deepEqual(emptyReviewSchedule(), { mode: 'disabled', opensAt: '', closesAt: '' })
  for (const mode of ['disabled', 'immediate']) {
    assert.deepEqual(reviewScheduleToPolicy({ mode, opensAt: 'invalid', closesAt: 'invalid' }), { allowReview: mode === 'immediate', availableFrom: null, availableUntil: null })
  }
})
test('scheduled review requires valid opening and optional closing strictly later', () => {
  assert.match(validateReviewSchedule({ mode: 'scheduled', opensAt: '', closesAt: '' }), /opens/i)
  assert.match(validateReviewSchedule({ mode: 'scheduled', opensAt: '2026-02-30T09:00', closesAt: '' }), /valid/i)
  assert.match(validateReviewSchedule({ mode: 'scheduled', opensAt: '2026-11-13T09:00', closesAt: '2026-11-13T09:00' }), /later/i)
  assert.throws(() => reviewScheduleToPolicy({ mode: 'scheduled', opensAt: 'invalid' }), /valid/i)
  assert.equal(validateReviewSchedule({ mode: 'scheduled', opensAt: '2020-01-01T09:00', closesAt: '' }), null)
})
test('policy conversion preserves local timestamps and past windows', () => {
  const value = { mode: 'scheduled', opensAt: '2020-01-01T09:00', closesAt: '2020-01-01T10:30' }
  const policy = reviewScheduleToPolicy(value)
  assert.equal(policy.availableFrom, new Date(value.opensAt).toISOString())
  assert.deepEqual(reviewScheduleFromPolicy(policy), value)
  assert.deepEqual(reviewScheduleFromPolicy({ allowReview: true }), { mode: 'immediate', opensAt: '', closesAt: '' })
  assert.deepEqual(reviewScheduleFromPolicy({ allowReview: false, availableFrom: policy.availableFrom }), emptyReviewSchedule())
})
