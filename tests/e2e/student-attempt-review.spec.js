import { expect, test } from '@playwright/test'

async function reviewFixture(page, { accessFails = false } = {}) {
  const controls = { allowed: true, reviewFails: false, detailRequests: 0 }
  const row = { attemptId: 'quiz-attempt', quizId: 'quiz-one', quizTitle: 'Addressing quiz', attemptNumber: 1, scorePoints: 1, maximumPoints: 2, percentage: 50, passed: false, submittedAt: '2026-11-12T00:00:00Z' }
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if ((endpoint === 'get_student_attempt_review_access' && accessFails) || (endpoint === 'get_student_attempt_review' && (!controls.allowed || controls.reviewFails))) {
      await route.fulfill({ status: 403, json: { message: 'Review is unavailable' } }); return
    }
    const data = {
      get_student_active_assessment_session: null,
      get_student_recent_quiz_results: [row],
      get_student_cli_history: [{ ...row, attemptId: 'cli-attempt', labId: 'lab-one', title: 'Switch practical', status: 'submitted' }],
      get_student_attempt_review_access: controls.allowed ? [{ assessmentType: 'quiz', attemptId: 'quiz-attempt' }, { assessmentType: 'cli', attemptId: 'cli-attempt' }] : [],
    }
    if (endpoint === 'get_student_attempt_review') {
      controls.detailRequests += 1
      const body = route.request().postDataJSON()
      data[endpoint] = body.p_assessment_type === 'quiz' ? {
        assessmentType: 'quiz', attempt: { id: 'quiz-attempt', title: 'Addressing quiz', scorePoints: 1, maximumPoints: 2, percentage: 50 },
        historicalContentNotice: 'Some wording comes from the current quiz.',
        questions: [{ id: 'question-one', questionText: 'Choose a private address', points: 2, pointsAwarded: 1, isCorrect: false, selectedOptionIds: ['public'], options: [{ id: 'public', text: '8.8.8.8', isCorrect: false }, { id: 'private', text: '192.168.1.1', isCorrect: true }], correctAnswers: [] },
          { id: 'identification', type: 'identification', questionText: 'Name the protocol', answerText: 'IPv4', options: [{ id: 'accepted', text: 'IPv4', isCorrect: true }], correctAnswers: ['IPv4'] },
          { id: 'historical', type: 'single_choice', questionText: 'Historical question', selectedOptionIds: ['removed-option'], options: [{ id: 'current-option', text: 'Current choice', isCorrect: true }] }],
      } : {
        assessmentType: 'cli', attempt: { id: 'cli-attempt', title: 'Switch practical', scorePoints: 1, maximumPoints: 2 },
        criteria: [{ type: 'hostname', expected: 'Access1', met: true, points: 2, pointsAwarded: 2, deviceId: 'device-id' }, { type: 'interface_enabled', target: 'GigabitEthernet0/1', expected: '', met: true, points: 1, pointsAwarded: 1 }, { type: 'vlan_exists', target: '10', expected: '', met: true }, { type: 'config_saved', expected: '', met: true }],
        commands: [{ sequence: 1, command: 'hostname Access1', accepted: true, output: '', deviceId: 'device-id' }], state: { deviceStates: { 'device-id': { hostname: 'Access1', saved: true } } },
      }
    }
    await route.fulfill({ json: data[endpoint] ?? [] })
  })
  await page.goto('/?uat-role=student#/student/history')
  await expect(page.getByRole('heading', { name: 'Addressing quiz', exact: true })).toBeVisible({ timeout: 45000 })
  return controls
}

test('student reviews selected and correct quiz answers, clears on revocation and fetches each open', async ({ page }, testInfo) => {
  const controls = await reviewFixture(page)
  const review = page.locator('.student-recent-results:not(.student-cli-history)').getByRole('button', { name: 'Review attempt 1' })
  await review.click()
  const popup = page.getByRole('dialog', { name: 'Addressing quiz' })
  await expect(popup.getByText('Choose a private address')).toBeVisible()
  await expect(popup.getByText('Your choice')).toBeVisible()
  await expect(popup.getByText('Correct answer', { exact: true }).first()).toBeVisible()
  await expect(popup.getByText('Some wording comes from the current quiz.')).toBeVisible()
  const identification = popup.locator('.student-attempt-review__card').filter({ hasText: 'Name the protocol' })
  await expect(identification.getByRole('heading', { name: 'Your answer' })).toBeVisible()
  await expect(identification.getByRole('heading', { name: 'Accepted answers' })).toBeVisible()
  await expect(identification.locator('.student-attempt-review__options')).toHaveCount(0)
  await expect(popup.getByText('Your selected answer is no longer available in the question content shown here.')).toBeVisible()
  await popup.evaluate((element) => { element.scrollTop = 0 })
  await page.screenshot({ path: testInfo.outputPath('student-quiz-review.png') })
  const previousRequests = controls.detailRequests
  await page.keyboard.press('Escape')
  await expect(review).toBeFocused()
  await review.click()
  await expect.poll(() => controls.detailRequests).toBeGreaterThan(previousRequests)
  controls.allowed = false
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(popup.getByText('Choose a private address')).toHaveCount(0)
  await expect(popup.getByRole('alert')).toBeVisible()
})

test('review access failure does not block history scores or enable detail requests', async ({ page }) => {
  const controls = await reviewFixture(page, { accessFails: true })
  await expect(page.locator('.recent-attempt-score').first()).toContainText('50.00%')
  await expect(page.getByRole('button', { name: 'Review attempt 1' }).first()).toBeDisabled()
  expect(controls.detailRequests).toBe(0)
})

test('practical review presents expected configuration, commands and final state on phones', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await reviewFixture(page)
  await page.locator('.student-cli-history').getByRole('button', { name: 'Review attempt 1' }).click()
  const popup = page.getByRole('dialog', { name: 'Switch practical' })
  await expect(popup.getByRole('heading', { name: 'Expected configuration' })).toBeVisible()
  await expect(popup.getByText('hostname Access1', { exact: true })).toBeVisible()
  await expect(popup.getByRole('heading', { name: 'Final device state' })).toBeVisible()
  await expect(popup.getByText('Enabled (no shutdown)', { exact: true })).toBeVisible()
  await expect(popup.getByText('Must exist', { exact: true })).toBeVisible()
  await expect(popup.getByText('Running configuration saved', { exact: true })).toBeVisible()
  await expect(popup.getByText('Device: Access1', { exact: true })).toHaveCount(2)
  await expect(popup.getByText('Device: device-id', { exact: true })).toHaveCount(0)
  expect(await popup.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await popup.evaluate((element) => { element.scrollTop = 0 })
  await page.screenshot({ path: testInfo.outputPath('student-cli-review-phone.png') })
})

test('review errors clear answers and retry checks permission before fetching again', async ({ page }) => {
  const controls = await reviewFixture(page)
  controls.reviewFails = true
  await page.locator('.student-recent-results:not(.student-cli-history)').getByRole('button', { name: 'Review attempt 1' }).click()
  const popup = page.getByRole('dialog', { name: 'Addressing quiz' })
  await expect(popup.getByRole('alert')).toBeVisible()
  await expect(popup.getByText('Choose a private address')).toHaveCount(0)
  controls.reviewFails = false
  await popup.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(popup.getByText('Choose a private address')).toBeVisible()
})

test('a late response from a closed review cannot replace a newer review', async ({ page }) => {
  await reviewFixture(page)
  const waiting = []
  let hold = true
  await page.route('**/rpc/get_student_attempt_review', async (route) => {
    const held = hold
    if (held) await new Promise((resolve) => waiting.push(resolve))
    await route.fulfill({ json: { assessmentType: 'quiz', attempt: { id: 'quiz-attempt' }, questions: [{ id: 'q', questionText: held ? 'Old delayed question' : 'Fresh question', answerText: 'My answer', correctAnswers: ['Correct answer'] }] } })
  })
  const review = page.locator('.student-recent-results:not(.student-cli-history)').getByRole('button', { name: 'Review attempt 1' })
  await review.click()
  const popup = page.getByRole('dialog', { name: 'Addressing quiz' })
  await expect(popup.getByRole('status')).toBeVisible()
  await expect.poll(() => waiting.length).toBeGreaterThan(0)
  await popup.getByRole('button', { name: 'Done', exact: true }).click()
  hold = false
  await review.click()
  await expect(popup.getByText('Fresh question')).toBeVisible()
  waiting.splice(0).forEach((release) => release())
  await expect(popup.getByText('Old delayed question')).toHaveCount(0)
  await expect(popup.getByText('Fresh question')).toBeVisible()
})

test('pending revalidation retains review content, then removes it when access is denied', async ({ page }) => {
  const controls = await reviewFixture(page)
  await page.locator('.student-recent-results:not(.student-cli-history)').getByRole('button', { name: 'Review attempt 1' }).click()
  const popup = page.getByRole('dialog', { name: 'Addressing quiz' })
  await expect(popup.getByText('Choose a private address')).toBeVisible()
  let release
  await page.route('**/rpc/get_student_attempt_review', async (route) => {
    await new Promise((resolve) => { release = resolve })
    await route.fallback()
  })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(popup.getByRole('status')).toHaveText('Checking review access...')
  await expect(popup.getByText('Choose a private address')).toBeVisible()
  controls.allowed = false
  release()
  await expect(popup.getByRole('alert')).toBeVisible()
  await expect(popup.getByText('Choose a private address')).toHaveCount(0)
})
