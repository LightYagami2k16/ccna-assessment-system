const FORMAT_NAME = 'ccna-assessment-instructional-backup'
const FORMAT_VERSION = 1

const COLLECTION_LIMITS = {
  courses: 20,
  modules: 1000,
  questions: 5000,
  quizzes: 1000,
  quizTemplates: 1000,
  cliPracticals: 1000,
  cliTemplates: 1000,
}

export function validateInstructionalBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Select a valid instructional-content backup file.')
  }
  if (payload.format !== FORMAT_NAME || payload.version !== FORMAT_VERSION) {
    throw new Error('This instructional backup format or version is not supported.')
  }

  for (const [collection, limit] of Object.entries(COLLECTION_LIMITS)) {
    if (!Array.isArray(payload[collection])) {
      throw new Error(`The backup is missing its ${collection} collection.`)
    }
    if (payload[collection].length > limit) {
      throw new Error(`The backup contains too many ${collection} records.`)
    }
  }

  return payload
}

export function summarizeInstructionalBackup(payload) {
  const validated = validateInstructionalBackup(payload)
  return {
    courses: validated.courses.length,
    modules: validated.modules.length,
    questions: validated.questions.length,
    quizzes: validated.quizzes.length,
    quizTemplates: validated.quizTemplates.length,
    cliPracticals: validated.cliPracticals.length,
    cliTemplates: validated.cliTemplates.length,
    total:
      validated.modules.length
      + validated.questions.length
      + validated.quizzes.length
      + validated.quizTemplates.length
      + validated.cliPracticals.length
      + validated.cliTemplates.length,
  }
}

export function instructionalBackupFilename(date = new Date()) {
  return `ccna-instructional-content-${date.toISOString().slice(0, 10)}.json`
}

