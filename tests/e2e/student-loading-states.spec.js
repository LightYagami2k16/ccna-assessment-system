import { expect, test } from '@playwright/test'

async function delayedStudentData(page, heldEndpoint) {
  let paused = true
  let failed = false
  const waiting = []
  const result = {
    attemptId: 'attempt-one', quizId: 'quiz-one', labId: 'lab-one',
    quizTitle: 'Retained quiz', title: 'Retained practical', courseCode: 'ITN',
    attemptNumber: 1, percentage: 80, scorePoints: 8, maximumPoints: 10,
    passed: true, submittedAt: '2026-11-12T00:00:00Z',
  }
  const data = {
    get_available_quizzes_for_student: [{ id: 'quiz-one', title: 'Retained quiz', max_attempts: 3 }],
    get_available_cli_labs: [{ id: 'lab-one', title: 'Retained practical', attemptsUsed: 0, maxAttempts: 3 }],
    get_student_recent_quiz_results: [result],
    get_student_cli_history: [result],
    get_student_class_enrollment: {
      classes: [{ id: 'class-one', code: 'ITN', name: 'Retained class' }], requests: [],
    },
    get_student_active_assessment_session: null,
  }
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === heldEndpoint && paused) {
      await new Promise((resolve) => waiting.push(resolve))
    }
    if (endpoint === heldEndpoint && failed) {
      await route.fulfill({ status: 500, json: { message: 'Refresh temporarily unavailable' } })
    } else {
      await route.fulfill({ json: data[endpoint] ?? [] })
    }
  })
  return {
    pause() { paused = true },
    pending() { return waiting.length },
    release({ fail = false } = {}) {
      failed = fail
      paused = false
      waiting.splice(0).forEach((resolve) => resolve())
    },
  }
}

for (const section of [
  { path: 'assessments', selector: '.student-quiz-list', title: 'Available quizzes',
    endpoint: 'get_available_quizzes_for_student', loading: 'Loading quizzes...', retained: 'Retained quiz' },
  { path: 'practicals', selector: '.student-cli-labs', title: 'Available CLI practicals',
    endpoint: 'get_available_cli_labs', loading: 'Loading CLI practicals...', retained: 'Retained practical' },
  { path: 'history', selector: '.student-recent-results:not(.student-cli-history)', title: 'Quiz history',
    endpoint: 'get_student_recent_quiz_results', loading: 'Loading quiz history...', retained: 'Retained quiz' },
  { path: 'history', selector: '.student-cli-history', title: 'Practical history',
    endpoint: 'get_student_cli_history', loading: 'Loading CLI history...', retained: 'Retained practical' },
]) {
  test(`${section.title} retains its heading initially and content during delayed or failed refresh`, async ({ page }) => {
    const requests = await delayedStudentData(page, section.endpoint)
    await page.goto(`/?uat-role=student#/student/${section.path}`)
    const panel = page.locator(section.selector)
    await expect(page.getByRole('navigation', { name: 'Student workspace' })).toBeVisible()
    await expect(panel.getByRole('heading', { name: section.title, exact: true })).toBeVisible()
    await expect(panel.getByText(section.loading, { exact: true })).toBeVisible()
    await expect(panel.locator('.empty-state')).toHaveCount(0)
    requests.release()
    await expect(panel.getByRole('heading', { name: section.retained, exact: true })).toBeVisible()
    requests.pause()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect.poll(() => requests.pending()).toBeGreaterThan(0)
    await expect(panel.getByRole('heading', { name: section.retained, exact: true })).toBeVisible()
    await expect(panel.locator('.loading-state')).toHaveCount(0)
    requests.release({ fail: true })
    await expect(panel.getByRole('alert')).toContainText('Refresh temporarily unavailable')
    await expect(panel.getByRole('heading', { name: section.retained, exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  })
}

test('enrollment has no false initial count and retains its expanded class list on refresh', async ({ page }) => {
  const requests = await delayedStudentData(page, 'get_student_class_enrollment')
  await page.goto('/?uat-role=student#/student/classes')
  const panel = page.locator('.student-class-enrollment')
  await expect(panel.getByRole('heading', { name: 'Class enrollment', exact: true })).toBeVisible()
  await expect(panel.getByText('Loading class enrollment...', { exact: true })).toBeVisible()
  await expect(panel.getByText('0 enrolled', { exact: true })).toHaveCount(0)
  requests.release()
  await expect(panel.getByText('1 enrolled', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Manage enrollment', exact: true }).click()
  await expect(panel.getByText('Retained class', { exact: true })).toBeVisible()
  requests.pause()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => requests.pending()).toBeGreaterThan(0)
  await expect(panel.getByRole('button', { name: 'Hide enrollment', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect(panel.getByText('Retained class', { exact: true })).toBeVisible()
  await expect(panel.locator('.loading-state')).toHaveCount(0)
  requests.release()
  await expect.poll(() => requests.pending()).toBe(0)
  await expect(panel.getByText('Retained class', { exact: true })).toBeVisible()
})

test('enrollment retry clears its fetch error after successful recovery', async ({ page }) => {
  const requests = await delayedStudentData(page, 'get_student_class_enrollment')
  await page.goto('/?uat-role=student#/student/classes')
  const panel = page.locator('.student-class-enrollment')
  await expect(panel.getByText('Loading class enrollment...', { exact: true })).toBeVisible()
  requests.release({ fail: true })
  await expect(panel.getByRole('alert')).toContainText('Refresh temporarily unavailable')
  await expect(panel.getByText('Content unavailable. Please try again.', { exact: true })).toBeVisible()
  requests.pause()
  await panel.getByRole('button', { name: 'Retry', exact: true }).click()
  requests.release()
  await expect(panel.getByText('1 enrolled', { exact: true })).toBeVisible()
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await expect(panel.getByText('Content unavailable. Please try again.', { exact: true })).toHaveCount(0)
})
