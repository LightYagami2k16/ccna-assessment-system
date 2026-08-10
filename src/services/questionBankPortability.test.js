import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeQuestionBankPackage,
  createValidationReportCsv,
  createQuestionBankPackage,
  questionBankFilename,
  validationReportFilename,
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

test('collects valid and invalid bulk-import rows without stopping early', () => {
  const analysis = analyzeQuestionBankPackage({
    format: 'ccna-assessment-question-bank',
    version: 1,
    questions: [
      {
        courseCode: 'ITN',
        title: 'Valid question',
        questionText: 'Which command enters privileged EXEC mode?',
        questionType: 'multiple_choice',
        points: 1,
        options: [
          { text: 'enable', isCorrect: true },
          { text: 'login', isCorrect: false },
        ],
      },
      {
        courseCode: 'SRWE',
        title: 'Invalid question',
        questionText: 'Select two correct answers.',
        questionType: 'multiple_answer',
        points: 2,
        options: [
          { text: 'Only one selected', isCorrect: true },
          { text: 'Incorrect', isCorrect: false },
        ],
      },
    ],
  })

  assert.equal(analysis.report.totalCount, 2)
  assert.equal(analysis.report.validCount, 1)
  assert.equal(analysis.report.invalidCount, 1)
  assert.equal(analysis.importPackage.questions.length, 1)
  assert.match(analysis.report.entries[1].message, /at least two correct answers/)
})

test('creates a spreadsheet-safe CSV validation report', () => {
  const csv = createValidationReportCsv({
    entries: [{
      row: 1,
      status: 'invalid',
      courseCode: 'ITN',
      moduleCode: 'ITN-01',
      questionType: 'identification',
      title: '=unsafe formula',
      message: 'An answer is required.',
    }],
  })

  assert.match(csv, /Validation message/)
  assert.match(csv, /'=unsafe formula/)
  assert.equal(
    validationReportFilename(new Date('2026-08-10T12:30:45Z')),
    'ccna-question-import-validation-2026-08-10T12-30-45Z.csv',
  )
})
