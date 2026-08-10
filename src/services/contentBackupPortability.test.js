import assert from 'node:assert/strict'
import test from 'node:test'
import {
  instructionalBackupFilename,
  summarizeInstructionalBackup,
  validateInstructionalBackup,
} from './contentBackupPortability.js'

function sampleBackup(overrides = {}) {
  return {
    format: 'ccna-assessment-instructional-backup',
    version: 1,
    courses: [{ code: 'ITN' }],
    modules: [{ code: 'ITN-01' }],
    questions: [{ backupKey: 'question-1' }],
    quizzes: [{ backupKey: 'quiz-1' }],
    quizTemplates: [],
    cliPracticals: [{ backupKey: 'lab-1' }],
    cliTemplates: [],
    ...overrides,
  }
}

test('validates and summarizes an instructional backup', () => {
  const payload = validateInstructionalBackup(sampleBackup())
  const summary = summarizeInstructionalBackup(payload)

  assert.equal(summary.courses, 1)
  assert.equal(summary.questions, 1)
  assert.equal(summary.cliPracticals, 1)
  assert.equal(summary.total, 4)
})

test('rejects incomplete and unsupported backup files', () => {
  assert.throws(
    () => validateInstructionalBackup(sampleBackup({ quizzes: undefined })),
    /missing its quizzes collection/,
  )
  assert.throws(
    () => validateInstructionalBackup(sampleBackup({ version: 2 })),
    /format or version is not supported/,
  )
})

test('creates a stable dated backup filename', () => {
  assert.equal(
    instructionalBackupFilename(new Date('2026-08-10T04:00:00Z')),
    'ccna-instructional-content-2026-08-10.json',
  )
})

