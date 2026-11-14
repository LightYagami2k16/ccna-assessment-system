import { expect, test } from '@playwright/test'

async function mockStudent(page, state = {}) {
  const calls = new Map()
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    calls.set(endpoint, (calls.get(endpoint) || 0) + 1)
    if (state.failed === endpoint) return route.fulfill({ status: 500, json: { message: 'Temporary student load failure' } })
    const data = { get_student_active_assessment_session: null, get_student_class_enrollment: { classes: [], requests: [] } }
    await route.fulfill({ json: Object.hasOwn(data, endpoint) ? data[endpoint] : [] })
  })
  return calls
}

test('student pages have no routine refresh buttons and refresh on returning focus', async ({ page }) => {
  test.setTimeout(180000)
  const calls = await mockStudent(page)
  for (const [path, selector, endpoint] of [
    ['overview', '.student-overview', 'get_student_upcoming_assessments'],
    ['assessments', '.student-quiz-list', 'get_available_quizzes_for_student'],
    ['practicals', '.student-cli-labs', 'get_available_cli_labs'],
    ['history', '.student-assessment-history', 'get_student_recent_quiz_results'],
    ['classes', '.student-class-enrollment', 'get_student_class_enrollment'],
  ]) {
    await page.goto(`/?uat-role=student#/student/${path}`)
    const panel = page.locator(selector)
    await expect(panel).toBeVisible({ timeout: 45000 })
    await expect(panel.locator('.loading-state')).toHaveCount(0)
    await expect(panel.getByRole('button', { name: /^Refresh/ })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
    const before = calls.get(endpoint) || 0
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect.poll(() => calls.get(endpoint) || 0).toBeGreaterThan(before)
  }
})

test('student quiz failure offers Retry only until recovery', async ({ page }) => {
  const state = { failed: 'get_available_quizzes_for_student' }
  await mockStudent(page, state)
  await page.goto('/?uat-role=student#/student/assessments')
  const panel = page.locator('.student-quiz-list')
  await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: /^Refresh/ })).toHaveCount(0)
  state.failed = null
  await panel.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(panel.getByRole('heading', { name: 'No quizzes available', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
})

test('enrollment updates quietly, preserves a class-code draft, and pauses while hidden', async ({ page }) => {
  await page.clock.install()
  const calls = await mockStudent(page)
  await page.goto('/?uat-role=student#/student/classes')
  const panel = page.locator('.student-class-enrollment')
  await expect(panel.getByLabel('Class code', { exact: true })).toBeVisible({ timeout: 45000 })
  await panel.getByLabel('Class code', { exact: true }).fill('ABCD1234')
  const endpoint = 'get_student_class_enrollment'
  const before = calls.get(endpoint)
  await page.clock.runFor(31000)
  await expect.poll(() => calls.get(endpoint)).toBeGreaterThan(before)
  await expect(panel.getByLabel('Class code', { exact: true })).toHaveValue('ABCD1234')
  await expect(panel.locator('.loading-state')).toHaveCount(0)
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }))
  const hiddenBefore = calls.get(endpoint)
  await page.clock.runFor(31000)
  expect(calls.get(endpoint)).toBe(hiddenBefore)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => calls.get(endpoint)).toBeGreaterThan(hiddenBefore)
  await expect(panel.getByLabel('Class code', { exact: true })).toHaveValue('ABCD1234')
  await page.getByRole('navigation', { name: 'Student workspace' }).getByRole('button', { name: /Results & history/ }).click()
  await expect(page.locator('.student-assessment-history')).toBeVisible()
  const afterLeaving = calls.get(endpoint)
  await page.clock.runFor(31000)
  expect(calls.get(endpoint)).toBe(afterLeaving)
})
