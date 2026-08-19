const FORMAT_NAME = 'ccna-assessment-question-bank'
const FORMAT_VERSION = 1
const QUESTION_TYPES = new Set([
  'multiple_choice',
  'multiple_answer',
  'true_false',
  'identification',
])
const QUESTION_TYPE_ALIASES = new Map([
  ['mcq', 'multiple_choice'],
  ['single_answer', 'multiple_choice'],
  ['multiple_choice_single_answer', 'multiple_choice'],
  ['multiple_answers', 'multiple_answer'],
  ['multiple_select', 'multiple_answer'],
  ['mcma', 'multiple_answer'],
  ['true_or_false', 'true_false'],
  ['truefalse', 'true_false'],
  ['short_answer', 'identification'],
])
const DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced'])

function requiredText(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function normalizeQuestionType(value, label) {
  const normalized = requiredText(value, label)
    .toLowerCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')

  return QUESTION_TYPE_ALIASES.get(normalized) ?? normalized
}

function normalizeQuestion(question, index) {
  const label = `Question ${index + 1}`
  const questionType = normalizeQuestionType(
    question.questionType,
    `${label} type`,
  )
  if (!QUESTION_TYPES.has(questionType)) {
    throw new Error(`${label} has an unsupported question type.`)
  }

  const difficulty = String(question.difficulty ?? 'beginner').trim()
  if (!DIFFICULTIES.has(difficulty)) {
    throw new Error(`${label} has an unsupported difficulty.`)
  }

  const points = Number(question.points)
  if (!Number.isFinite(points) || points <= 0 || points > 1000) {
    throw new Error(`${label} points must be between 0 and 1000.`)
  }

  if (!Array.isArray(question.options) || !question.options.length) {
    throw new Error(`${label} must contain answer options.`)
  }

  const options = question.options.map((option, optionIndex) => ({
    text: requiredText(option.text, `${label}, answer ${optionIndex + 1}`),
    isCorrect: Boolean(option.isCorrect),
  }))
  const correctCount = options.filter((option) => option.isCorrect).length

  if (questionType === 'multiple_choice' && correctCount !== 1) {
    throw new Error(`${label} must have exactly one correct answer.`)
  }
  if (questionType === 'multiple_answer' && correctCount < 2) {
    throw new Error(`${label} must have at least two correct answers.`)
  }
  if (questionType === 'true_false' && (options.length !== 2 || correctCount !== 1)) {
    throw new Error(`${label} must contain one correct True/False answer.`)
  }
  if (questionType === 'identification' && correctCount !== options.length) {
    throw new Error(`${label} identification answers must all be accepted.`)
  }

  return {
    courseCode: requiredText(question.courseCode, `${label} course code`).toUpperCase(),
    moduleCode: String(question.moduleCode ?? '').trim().toUpperCase() || null,
    title: requiredText(question.title, `${label} title`),
    questionText: requiredText(question.questionText, `${label} text`),
    explanation: String(question.explanation ?? '').trim() || null,
    questionType,
    points,
    difficulty,
    sourceStatus: String(question.sourceStatus ?? 'draft').trim(),
    options,
  }
}

export function applyQuestionImportDestination(
  payload,
  { courseCode, moduleCode },
) {
  const normalizedCourseCode = requiredText(
    courseCode,
    'Destination course',
  ).toUpperCase()
  const normalizedModuleCode = requiredText(
    moduleCode,
    'Destination module',
  ).toUpperCase()

  return {
    ...payload,
    questions: (payload?.questions ?? []).map((question) => ({
      ...question,
      courseCode: normalizedCourseCode,
      moduleCode: normalizedModuleCode,
    })),
  }
}

function validatePackageEnvelope(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Select a valid CCNA question-bank JSON file.')
  }
  if (payload.format !== FORMAT_NAME || payload.version !== FORMAT_VERSION) {
    throw new Error('This question-bank file format or version is not supported.')
  }
  if (!Array.isArray(payload.questions) || !payload.questions.length) {
    throw new Error('The question-bank file does not contain any questions.')
  }
  if (payload.questions.length > 500) {
    throw new Error('A single import can contain at most 500 questions.')
  }
}

export function createQuestionBankPackage(questions) {
  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    questions: questions.map((question) => ({
      courseCode: question.courses?.code ?? '',
      moduleCode: question.modules?.code ?? null,
      title: question.title,
      questionText: question.question_text,
      explanation: question.explanation ?? null,
      questionType: question.question_type,
      points: Number(question.points),
      difficulty: question.difficulty,
      sourceStatus: question.status,
      options: (question.question_options ?? []).map((option) => ({
        text: option.option_text,
        isCorrect: Boolean(option.is_correct),
      })),
    })),
  }
}

export function validateQuestionBankPackage(payload) {
  validatePackageEnvelope(payload)

  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    questions: payload.questions.map(normalizeQuestion),
  }
}

export function analyzeQuestionBankPackage(payload) {
  validatePackageEnvelope(payload)

  const questions = []
  const entries = payload.questions.map((question, index) => {
    const fallbackTitle = String(question?.title ?? '').trim()
      || `Question ${index + 1}`
    const courseCode = String(question?.courseCode ?? '').trim().toUpperCase()
    const moduleCode = String(question?.moduleCode ?? '').trim().toUpperCase()
    const questionType = String(question?.questionType ?? '').trim()

    try {
      const normalized = normalizeQuestion(question, index)
      questions.push(normalized)
      return {
        row: index + 1,
        status: 'valid',
        title: normalized.title,
        courseCode: normalized.courseCode,
        moduleCode: normalized.moduleCode ?? '',
        questionType: normalized.questionType,
        message: 'Ready to import as a draft.',
      }
    } catch (error) {
      return {
        row: index + 1,
        status: 'invalid',
        title: fallbackTitle,
        courseCode,
        moduleCode,
        questionType,
        message: error.message,
      }
    }
  })

  const invalidCount = entries.filter(
    (entry) => entry.status === 'invalid',
  ).length

  return {
    importPackage: {
      format: FORMAT_NAME,
      version: FORMAT_VERSION,
      questions,
    },
    report: {
      format: 'ccna-question-bank-validation-report',
      version: 1,
      generatedAt: new Date().toISOString(),
      totalCount: entries.length,
      validCount: questions.length,
      invalidCount,
      entries,
    },
  }
}

function safeCsvValue(value) {
  let text = String(value ?? '')
  if (/^[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function createValidationReportCsv(report) {
  const header = [
    'Row',
    'Status',
    'Course code',
    'Module code',
    'Question type',
    'Title',
    'Validation message',
  ]
  const rows = (report?.entries ?? []).map((entry) => [
    entry.row,
    entry.status,
    entry.courseCode,
    entry.moduleCode,
    entry.questionType,
    entry.title,
    entry.message,
  ])

  return [header, ...rows]
    .map((row) => row.map(safeCsvValue).join(','))
    .join('\r\n')
}

export function validationReportFilename(date = new Date()) {
  const stamp = date.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
  return `ccna-question-import-validation-${stamp}.csv`
}

export function questionBankFilename(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10)
  return `ccna-question-bank-${stamp}.json`
}
