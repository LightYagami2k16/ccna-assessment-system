import assert from 'node:assert/strict'
import test from 'node:test'
import { readyPracticals, readyQuizzes, upcomingAssessments } from './studentOverviewModel.js'

test('quiz counts exclude archived/exhausted/in-progress work and preserve eligible retakes', () => {
  const quizzes = ['new', 'archived', 'exhausted', 'active', 'retake'].map((id) => ({ id, max_attempts: 2 }))
  const statuses = [{ quizId: 'archived', archived: true, attemptsRemaining: 1 },
    { quizId: 'exhausted', attemptsRemaining: 0 }, { quizId: 'active', hasActiveAttempt: true, attemptsRemaining: 1 },
    { quizId: 'retake', attemptsRemaining: '1' }]
  assert.deepEqual(readyQuizzes([...quizzes, quizzes[0]], statuses).map((item) => item.id), ['new', 'retake'])
})

test('practicals use authoritative remaining attempts, archives and active IDs', () => {
  const labs = [{ id: 'new', maxAttempts: 2, attemptsUsed: 0 }, { id: 'used', maxAttempts: 1, attemptsUsed: 1 },
    { id: 'active', maxAttempts: 2, attemptsUsed: 1, activeAttemptId: 'attempt' },
    { id: 'archived', maxAttempts: 2, attemptsUsed: 1 }, { id: 'extra', maxAttempts: 1, attemptsUsed: 1 }]
  assert.deepEqual(readyPracticals(labs, [{ labId: 'archived', archived: true }, { labId: 'extra', attemptsRemaining: '2' }]).map((item) => item.id), ['new', 'extra'])
})

test('invalid or missing attempt limits are not counted as available', () => {
  assert.deepEqual(readyQuizzes([{ id: 'q', max_attempts: 'unknown' }], []), [])
  assert.deepEqual(readyPracticals([{ id: 'lab' }], []), [])
  assert.deepEqual(readyQuizzes([], []), [])
})

test('upcoming items reject past/invalid windows and sort real opening instants', () => {
  const now = Date.parse('2026-11-13T00:00:00Z')
  const items = [{ id: 'late', assessmentType: 'quiz', availableFrom: '2026-11-14T00:00:00Z' },
    { id: 'first', assessmentType: 'quiz', availableFrom: '2026-11-13T10:00:00+08:00' },
    { id: 'past', assessmentType: 'quiz', availableFrom: '2026-11-12T00:00:00Z' },
    { id: 'invalid', assessmentType: 'quiz', availableFrom: 'invalid' },
    { id: 'closed', assessmentType: 'quiz', availableFrom: '2026-11-14T00:00:00Z', availableUntil: '2026-11-13T00:00:00Z' }]
  assert.deepEqual(upcomingAssessments(items, now).map((item) => item.id), ['first', 'late'])
})

test('overview details keep student-facing metadata and lifecycle allowances without answer payloads', () => {
  const quiz = readyQuizzes([{ id: 'q', title: 'Quiz', description: 'Quiz description', duration_minutes: 45, passing_score: 80, max_attempts: 2, courses: { code: 'ITN', title: 'Networks' }, modules: { code: 'ITN-01', title: 'Basics' }, questions: ['private'], answer_key: 'private' }], [{ quizId: 'q', attemptsUsed: 1, maxAttempts: 3, attemptsRemaining: 2 }])[0]
  assert.equal(quiz.durationMinutes, 45)
  assert.equal(quiz.passingScore, 80)
  assert.equal(quiz.attemptsRemaining, 2)
  assert.equal(quiz.maxAttempts, 3)
  assert.equal(quiz.courseTitle, 'Networks')
  assert.equal(quiz.moduleTitle, 'Basics')
  assert.equal(quiz.questions, undefined)
  assert.equal(quiz.answer_key, undefined)
  const practical = readyPracticals([{ id: 'lab', title: 'Practical', description: 'Configure', durationMinutes: 30, passingScore: 70, deviceType: 'router', maxAttempts: 2, attemptsUsed: 1 }], [])[0]
  assert.equal(practical.durationMinutes, 30)
  assert.equal(practical.deviceType, 'router')
  assert.equal(practical.attemptsRemaining, 1)
  assert.equal(practical.description, 'Configure')
})
