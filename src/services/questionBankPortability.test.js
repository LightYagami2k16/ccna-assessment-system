import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createQuestionBankPackage,
  questionBankFilename,
  validateQuestionBankPackage,
} from './questionBankPortability.js'

test('exports questions without database identifiers', () => {
  const payload = createQuestionBankPackage([{
    id: 'database-id',
    courses: { code: 'ITN' },
    modules: { code: 'ITN-01' },
    title: 'Network device',
    question_text: 'Which device forwards packets?',
    explanation: 'Routers forward packets between networks.',
    question_type: 'multiple_choice',
    points: 2,
    difficulty: 'beginner',
    status: 'published',
    question_options: [
      { id: 'option-id', option_text: 'Router', is_correct: true },
      { id: 'option-id-2', option_text: 'Hub', is_correct: false },
    ],
  }])

  assert.equal(payload.format, 'ccna-assessment-question-bank')
  assert.equal(payload.version, 1)
  assert.equal(payload.questions[0].courseCode, 'ITN')
  assert.equal(payload.questions[0].id, undefined)
  assert.equal(payload.questions[0].options[0].id, undefined)
})

test('validates and normalizes a portable question bank', () => {
  const normalized = validateQuestionBankPackage({
    format: 'ccna-assessment-question-bank',
    version: 1,
    questions: [{
      courseCode: 'itn',
      moduleCode: 'itn-01',
      title: ' Device mode ',
      questionText: 'Which prompt is privileged EXEC?',
      questionType: 'multiple_choice',
      points: '1',
      difficulty: 'beginner',
      options: [
        { text: 'Switch#', isCorrect: true },
        { text: 'Switch>', isCorrect: false },
      ],
    }],
  })

  assert.equal(normalized.questions[0].courseCode, 'ITN')
  assert.equal(normalized.questions[0].moduleCode, 'ITN-01')
  assert.equal(normalized.questions[0].title, 'Device mode')
  assert.equal(normalized.questions[0].points, 1)
})

test('rejects invalid multiple-answer content', () => {
  assert.throws(() => validateQuestionBankPackage({
    format: 'ccna-assessment-question-bank',
    version: 1,
    questions: [{
      courseCode: 'SRWE',
      title: 'VLAN selection',
      questionText: 'Select two VLAN facts.',
      questionType: 'multiple_answer',
      points: 2,
      difficulty: 'intermediate',
      options: [
        { text: 'Fact one', isCorrect: true },
        { text: 'Fact two', isCorrect: false },
      ],
    }],
  }), /at least two correct answers/)
})

test('creates a stable dated export filename', () => {
  assert.equal(
    questionBankFilename(new Date('2026-08-05T12:00:00Z')),
    'ccna-question-bank-2026-08-05.json',
  )
})

