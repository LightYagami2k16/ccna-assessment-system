const MAX_MESSAGE_LENGTH = 500
const MAX_STACK_LENGTH = 2500

function cleanText(value, maximumLength) {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/gi, '[url removed]')
    .replace(/[\r\n]{3,}/g, '\n\n')
    .trim()
    .slice(0, maximumLength)
}

export function createErrorTelemetry(error, details = {}) {
  const normalizedError = error instanceof Error
    ? error
    : new Error(typeof error === 'string' ? error : 'Unexpected application error')

  return {
    kind: details.kind ?? 'runtime',
    name: cleanText(normalizedError.name || 'Error', 120),
    message: cleanText(normalizedError.message, MAX_MESSAGE_LENGTH)
      || 'Unexpected application error',
    stack: cleanText(normalizedError.stack, MAX_STACK_LENGTH) || null,
    component: cleanText(details.component, 160) || null,
    path: cleanText(details.path, 300) || null,
    context: {
      online: details.online,
      viewportWidth: details.viewportWidth,
      viewportHeight: details.viewportHeight,
      language: cleanText(details.language, 30) || null,
      build: cleanText(details.build, 80) || null,
    },
  }
}

