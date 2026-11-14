import { expect, test } from '@playwright/test'

async function mockOverview(page, state = {}) {
  const future = new Date(Date.now() + 7200000).toISOString()
  const courses = { id: 1, code: 'ITN', title: 'Introduction to Networks' }
  const quizzes = ['open', 'archived', 'exhausted', 'active'].map((id) => ({ id: `q-${id}`, title: `Quiz ${id}`, max_attempts: 3, courses }))
  const quizStatuses = [
    { quizId: 'q-archived', archived: true, attemptsRemaining: 2 },
    { quizId: 'q-exhausted', archived: false, attemptsRemaining: 0 },
    { quizId: 'q-active', hasActiveAttempt: true, attemptsRemaining: 2 },
  ]
  const labs = ['open', 'archived', 'exhausted', 'active'].map((id) => ({ id: `lab-${id}`, title: `Practical ${id}`, maxAttempts: 2, attemptsUsed: id === 'exhausted' ? 2 : 0, activeAttemptId: id === 'active' ? 'cli-active' : null, courseCode: 'ITN' }))
  const labStatuses = [{ labId: 'lab-archived', archived: true, attemptsRemaining: 1 }]
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if ((endpoint === 'get_student_active_assessment_session' && state.sessionError)
      || (endpoint === 'get_available_quizzes_for_student' && state.quizError)) {
      return route.fulfill({ status: 500, json: { code: state.sessionError ? 'PGRST202' : 'XX000', message: 'get_student_active_assessment_session failed' } })
    }
    if (endpoint === 'get_student_upcoming_assessments' && state.upcomingMissing) {
      return route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Function unavailable' } })
    }
    const responses = {
      get_student_active_assessment_session: state.session ?? null,
      get_available_quizzes_for_student: state.quizzes ?? quizzes,
      get_student_quiz_archive_statuses: quizStatuses,
      get_available_cli_labs: labs,
      get_student_cli_archive_statuses: labStatuses,
      get_student_upcoming_assessments: [{ id: 'q-future', assessmentType: 'quiz', title: 'Scheduled module quiz', courseCode: 'ITN', availableFrom: future, availableUntil: new Date(Date.now() + 10800000).toISOString() }],
    }
    await route.fulfill({ json: Object.hasOwn(responses, endpoint) ? responses[endpoint] : [] })
  })
  return state
}

test('overview shows eligible available assessments and scheduled work with working links', async ({ page }) => {
  await mockOverview(page)
  await page.goto('/?uat-role=student#/student/overview')
  const overview = page.locator('.student-overview')
  const quizzes = overview.getByRole('article', { name: 'Available quizzes', exact: true })
  const practicals = overview.getByRole('article', { name: 'Available CLI practicals', exact: true })
  await expect(quizzes.locator('.student-overview-summary__count')).toHaveText('1')
  await expect(practicals.locator('.student-overview-summary__count')).toHaveText('1')
  await expect(quizzes.getByText('Quiz open', { exact: true })).toHaveCount(0)
  await expect(quizzes.getByText('Quiz archived', { exact: true })).toHaveCount(0)
  await expect(overview.getByText('Scheduled module quiz', { exact: true })).toBeVisible()
  await expect(overview.getByText('You have no assessment attempt in progress.', { exact: true })).toBeVisible()
  await quizzes.getByRole('button', { name: 'Show Details', exact: true }).click()
  const details = page.getByRole('dialog', { name: 'Available quizzes', exact: true })
  await expect(details.getByText('Quiz open', { exact: true })).toBeVisible()
  await details.getByRole('button', { name: 'View quizzes', exact: true }).click()
  await expect(page).toHaveURL(/#\/student\/assessments$/)
})

test('unavailable session lookup never appears as no active attempt and can recover', async ({ page }) => {
  const state = await mockOverview(page, { sessionError: true })
  await page.goto('/?uat-role=student#/student/overview')
  const overview = page.locator('.student-overview')
  await expect(overview.getByRole('alert').filter({ hasText: 'Assessment status' })).toBeVisible()
  await expect(overview.locator('.student-overview__ready')).toHaveCount(0)
  state.sessionError = false
  await overview.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(overview.getByText('You have no assessment attempt in progress.', { exact: true })).toBeVisible()
})

for (const type of ['quiz', 'cli']) {
  test(`overview identifies and resumes an active ${type} attempt`, async ({ page }) => {
    await mockOverview(page, { session: { type, attemptId: 'in-progress', assessmentId: type === 'quiz' ? 'q-active' : 'lab-active', title: 'My unfinished assessment', expiresAt: new Date(Date.now() + 3600000).toISOString() } })
    await page.goto('/?uat-role=student#/student/overview')
    await expect(page.getByRole('heading', { name: 'My unfinished assessment', exact: true })).toBeVisible()
    await page.getByRole('button', { name: type === 'quiz' ? 'Resume quiz' : 'Resume CLI practical', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`#/student/${type === 'quiz' ? 'quiz' : 'practical'}/in-progress$`))
  })
}

test('overview preserves partial data, missing schedule feedback, and quiet updates on phones', async ({ page }) => {
  await page.clock.install()
  const state = await mockOverview(page, { upcomingMissing: true })
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.goto('/?uat-role=student#/student/overview')
  const overview = page.locator('.student-overview')
  const quizzes = overview.getByRole('article', { name: 'Available quizzes', exact: true })
  await expect(quizzes.locator('.student-overview-summary__count')).toHaveText('1')
  await expect(overview.getByRole('region', { name: 'Upcoming assessments', exact: true }).getByRole('alert')).toBeVisible()
  state.quizError = true
  await overview.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(quizzes.getByRole('alert')).toBeVisible()
  await expect(quizzes.locator('.student-overview-summary__count')).toHaveText('1')
  state.quizError = false
  state.quizzes = []
  await page.clock.runFor(31000)
  await expect(quizzes.locator('.student-overview-summary__count')).toHaveText('0')
  await expect(quizzes.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
})

test('initial checking shows unknown counts and initial failures remain retryable', async ({ page }, testInfo) => {
  let release
  const waiting = new Promise((resolve) => { release = resolve })
  const state = await mockOverview(page, { quizError: true })
  await page.route('**/rest/v1/rpc/get_student_active_assessment_session', async (route) => {
    await waiting
    await route.fulfill({ json: null })
  })
  await page.goto('/?uat-role=student#/student/overview')
  const overview = page.locator('.student-overview')
  await expect(overview.getByText('Checking your active attempt...', { exact: true })).toBeVisible({ timeout: 45000 })
  await expect(overview.locator('.student-overview__ready')).toHaveCount(0)
  const quizzes = overview.getByRole('article', { name: 'Available quizzes', exact: true })
  await expect(quizzes.getByRole('alert')).toBeVisible()
  await expect(quizzes.locator('.student-overview-summary__count')).toHaveText('—')
  release()
  await expect(overview.locator('.student-overview__ready')).toBeVisible()
  state.quizError = false
  await overview.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(quizzes.locator('.student-overview-summary__count')).toHaveText('1')
  await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('overview-phone.png'), fullPage: true })
})
