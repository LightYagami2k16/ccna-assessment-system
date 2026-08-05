const FORMAT_NAME = 'ccna-assessment-question-bank'
const FORMAT_VERSION = 1
const QUESTION_TYPES = new Set([
  'multiple_choice',
  'multiple_answer',
  'true_false',
  'identification',
])
const DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced'])

function requiredText(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function normalizeQuestion(question, index) {
  const label = `Question ${index + 1}`
  const questionType = requiredText(question.questionType, `${label} type`)
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

  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    questions: payload.questions.map(normalizeQuestion),
  }
}

export function questionBankFilename(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10)
  return `ccna-question-bank-${stamp}.json`
}

