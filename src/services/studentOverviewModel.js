function remaining(status, maximum, used = 0) {
  const explicit = status?.attemptsRemaining
  if (explicit !== null && explicit !== undefined && Number.isFinite(Number(explicit))) return Number(explicit)
  const max = Number(status?.maxAttempts ?? maximum)
  const count = Number(status?.attemptsUsed ?? used)
  return Number.isFinite(max) && Number.isFinite(count) ? Math.max(0, max - count) : 0
}

function unique(items) {
  const seen = new Set()
  return items.filter((item) => {
    const key = `${item.assessmentType || ''}:${item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function readyQuizzes(quizzes, statuses) {
  const lifecycle = new Map(statuses.map((status) => [String(status.quizId), status]))
  return unique(quizzes.filter((quiz) => {
    const status = lifecycle.get(String(quiz.id))
    return quiz.id && !status?.archived && !status?.hasActiveAttempt && remaining(status, quiz.max_attempts) > 0
  }).map((quiz) => ({ id: quiz.id, assessmentType: 'quiz', title: quiz.title,
    courseCode: quiz.courses?.code, courseTitle: quiz.courses?.title,
    moduleCode: quiz.modules?.code, moduleTitle: quiz.modules?.title,
    description: quiz.description, durationMinutes: quiz.duration_minutes, passingScore: quiz.passing_score,
    maxAttempts: lifecycle.get(String(quiz.id))?.maxAttempts ?? quiz.max_attempts,
    attemptsUsed: lifecycle.get(String(quiz.id))?.attemptsUsed,
    attemptsRemaining: remaining(lifecycle.get(String(quiz.id)), quiz.max_attempts),
    availableUntil: quiz.available_until })))
}

export function readyPracticals(practicals, statuses) {
  const lifecycle = new Map(statuses.map((status) => [String(status.labId), status]))
  return unique(practicals.filter((lab) => {
    const status = lifecycle.get(String(lab.id))
    return lab.id && !lab.activeAttemptId && !status?.activeAttemptId && !status?.hasActiveAttempt
      && !status?.archived && remaining(status, lab.maxAttempts, lab.attemptsUsed) > 0
  }).map((lab) => ({ id: lab.id, assessmentType: 'cli', title: lab.title,
    courseCode: lab.courseCode, moduleCode: lab.moduleCode,
    description: lab.description, durationMinutes: lab.durationMinutes, passingScore: lab.passingScore,
    deviceType: lab.deviceType, maxAttempts: lifecycle.get(String(lab.id))?.maxAttempts ?? lab.maxAttempts,
    attemptsUsed: lifecycle.get(String(lab.id))?.attemptsUsed ?? lab.attemptsUsed,
    attemptsRemaining: remaining(lifecycle.get(String(lab.id)), lab.maxAttempts, lab.attemptsUsed) })))
}

export function upcomingAssessments(items, now = Date.now()) {
  return unique(items.filter((item) => {
    const opens = Date.parse(item.availableFrom)
    const closes = item.availableUntil ? Date.parse(item.availableUntil) : null
    return item.id && ['quiz', 'cli'].includes(item.assessmentType) && Number.isFinite(opens) && opens > now
      && (closes === null || (Number.isFinite(closes) && closes > opens))
  }).sort((left, right) => Date.parse(left.availableFrom) - Date.parse(right.availableFrom)
    || String(left.title).localeCompare(String(right.title)) || String(left.id).localeCompare(String(right.id))))
}
