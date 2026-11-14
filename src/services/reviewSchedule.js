export function emptyReviewSchedule() {
  return { mode: 'disabled', opensAt: '', closesAt: '' }
}

function localDateTime(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Review settings contain an invalid date. Reload the settings before saving.')
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23).replace(/:00\.000$/, '').replace(/\.000$/, '')
}

function validLocalDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) return false
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return false
  const [year, month, day, hour, minute] = value.match(/\d+/g).map(Number)
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute
}

export function reviewScheduleFromPolicy(policy) {
  if (typeof policy?.allowReview !== 'boolean') throw new Error('Review settings are unavailable. Reload the settings before saving.')
  if (!policy.allowReview) return emptyReviewSchedule()
  if (!policy.availableFrom && !policy.availableUntil) return { ...emptyReviewSchedule(), mode: 'immediate' }
  const value = { mode: 'scheduled', opensAt: policy.availableFrom ? localDateTime(policy.availableFrom) : '', closesAt: policy.availableUntil ? localDateTime(policy.availableUntil) : '' }
  const error = validateReviewSchedule(value)
  if (error) throw new Error(error)
  return value
}

export function validateReviewSchedule(value) {
  if (!['disabled', 'immediate', 'scheduled'].includes(value?.mode)) return 'Choose review availability.'
  if (value.mode !== 'scheduled') return null
  if (!value.opensAt) return 'Enter when review opens.'
  if (!validLocalDateTime(value.opensAt)) return 'Enter a valid review opening date and time.'
  if (value.closesAt && !validLocalDateTime(value.closesAt)) return 'Enter a valid review closing date and time.'
  if (value.closesAt && new Date(value.closesAt) <= new Date(value.opensAt)) return 'Review closes must be later than review opens.'
  return null
}

export function reviewScheduleToPolicy(value) {
  const error = validateReviewSchedule(value)
  if (error) throw new Error(error)
  return {
    allowReview: value.mode !== 'disabled',
    availableFrom: value.mode === 'scheduled' ? new Date(value.opensAt).toISOString() : null,
    availableUntil: value.mode === 'scheduled' && value.closesAt ? new Date(value.closesAt).toISOString() : null,
  }
}
