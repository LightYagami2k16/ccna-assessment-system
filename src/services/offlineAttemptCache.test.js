import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  cachePendingAnswer,
  getPendingAnswers,
  hasPendingSubmission,
  markPendingAnswerSynced,
  setPendingSubmission,
} from './quizAnswerCache.js'
import {
  getPendingCliCommands,
  hasCliPendingSubmission,
  queueCliCommand,
  removePendingCliCommand,
  setCliPendingSubmission,
} from './cliAttemptCache.js'

const values = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  },
}

beforeEach(() => values.clear())

test('quiz answers and submission intent survive a reload', () => {
  cachePendingAnswer('quiz-1', 'question-1', { answerText: 'OSPF' })
  setPendingSubmission('quiz-1', true)

  assert.equal(getPendingAnswers('quiz-1')['question-1'].answerText, 'OSPF')
  assert.equal(hasPendingSubmission('quiz-1'), true)

  markPendingAnswerSynced('quiz-1', 'question-1')
  assert.deepEqual(getPendingAnswers('quiz-1'), {})
})

test('CLI commands remain ordered until each command is synchronized', () => {
  queueCliCommand('cli-1', { command: 'enable' })
  queueCliCommand('cli-1', { command: 'configure terminal' })
  setCliPendingSubmission('cli-1', true)

  const queued = getPendingCliCommands('cli-1')
  assert.deepEqual(queued.map((item) => item.payload.command), [
    'enable',
    'configure terminal',
  ])
  assert.equal(hasCliPendingSubmission('cli-1'), true)

  removePendingCliCommand('cli-1', queued[0].id)
  assert.deepEqual(
    getPendingCliCommands('cli-1').map((item) => item.payload.command),
    ['configure terminal'],
  )
})
