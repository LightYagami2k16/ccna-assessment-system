import { expect, test } from '@playwright/test'

async function mockAssessments(page) {
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = {
      get_student_active_assessment_session: null,
      get_available_quizzes_for_student: [{ id: 'quiz-one', title: 'Module knowledge check', description: 'Review addressing and subnetting.', duration_minutes: 45, passing_score: 80, max_attempts: 3, available_until: '2099-11-13T08:00:00Z', courses: { code: 'ITN', title: 'Introduction to Networks' }, modules: { code: 'ITN-02', title: 'Basic Configuration' } }, { id: 'quiz-two', title: 'Routing knowledge check', description: 'Routing fundamentals.', duration_minutes: 60, passing_score: 90, max_attempts: 1, courses: { code: 'ENSA' } }],
      get_student_quiz_archive_statuses: [{ quizId: 'quiz-one', attemptsUsed: 1, attemptsRemaining: 2, maxAttempts: 3 }],
      get_available_cli_labs: [{ id: 'lab-one', title: 'Switch configuration practical', description: 'Configure a secure access switch.', durationMinutes: 30, passingScore: 75, maxAttempts: 2, attemptsUsed: 0, courseCode: 'SRWE', moduleCode: 'SRWE-01', deviceType: 'switch' }, { id: 'lab-two', title: 'Router practical', description: 'Configure a router.', durationMinutes: 60, passingScore: 90, maxAttempts: 1, attemptsUsed: 0, courseCode: 'ENSA', deviceType: 'router' }],
    }
    await route.fulfill({ json: Object.hasOwn(data, endpoint) ? data[endpoint] : [] })
  })
  await page.goto('/?uat-role=student#/student/overview')
  await expect(page.locator('.student-overview')).toBeVisible({ timeout: 45000 })
}

test('available quiz and practical details open correctly without starting an attempt', async ({ page }, testInfo) => {
  await mockAssessments(page)
  await expect(page.getByRole('article', { name: 'Available quizzes', exact: true }).locator('.student-overview-summary__count')).toHaveText('2')
  await page.locator('.student-overview-availability').screenshot({ path: testInfo.outputPath('availability-cards.png') })
  for (const [card, title, description, duration, passing, remaining] of [
    ['Available quizzes', 'Module knowledge check', 'Review addressing and subnetting.', '45 minutes', '80%', '2'],
    ['Available CLI practicals', 'Switch configuration practical', 'Configure a secure access switch.', '30 minutes', '75%', '2'],
  ]) {
    const summary = page.getByRole('article', { name: card, exact: true })
    const button = summary.getByRole('button', { name: 'Show Details', exact: true })
    await expect(button).toHaveCount(1)
    await expect(summary.getByRole('button')).toHaveCount(1)
    await expect(summary.getByText(title, { exact: true })).toHaveCount(0)
    await button.click()
    const popup = page.getByRole('dialog', { name: card, exact: true })
    await expect(popup).toBeVisible()
    await expect(popup.locator('.student-assessment-details__item')).toHaveCount(2)
    await page.screenshot({ path: testInfo.outputPath(`${card === 'Available quizzes' ? 'quizzes' : 'practicals'}-collapsed.png`) })
    await expect(popup.getByText(card === 'Available quizzes' ? 'Routing knowledge check' : 'Router practical', { exact: true })).toBeVisible()
    const details = popup.locator('.student-assessment-details__item').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    await expect(details.getByText(description, { exact: true })).not.toBeVisible()
    const toggle = details.getByRole('button', { name: 'Show details', exact: true })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(details.getByRole('button', { name: 'Hide details', exact: true })).toHaveAttribute('aria-expanded', 'true')
    const other = popup.locator('.student-assessment-details__item').filter({ hasNot: page.getByRole('heading', { name: title, exact: true }) })
    await expect(other.getByRole('button', { name: 'Show details', exact: true })).toHaveAttribute('aria-expanded', 'false')
    await expect(other.locator('.student-assessment-details__fields')).not.toBeVisible()
    await expect(details.getByText(description, { exact: true })).toBeVisible()
    await expect(details.getByText(duration, { exact: true })).toBeVisible()
    await expect(details.getByText(passing, { exact: true })).toBeVisible()
    await expect(details.locator('div').filter({ has: page.locator('dt', { hasText: /^Attempts remaining$/ }) }).last().locator('dd')).toHaveText(remaining)
    await other.getByRole('button', { name: 'Show details', exact: true }).click()
    await expect(details.getByText(description, { exact: true })).toBeVisible()
    await details.getByRole('button', { name: 'Hide details', exact: true }).click()
    await expect(details.getByText(description, { exact: true })).not.toBeVisible()
    await expect(other.locator('.student-assessment-details__fields')).toBeVisible()
    await expect(popup.getByRole('button', { name: /Start|Resume/ })).toHaveCount(0)
    await popup.evaluate((element) => { element.scrollTop = 0 })
    await page.screenshot({ path: testInfo.outputPath(`${card === 'Available quizzes' ? 'quizzes' : 'practicals'}-details-desktop.png`) })
    await page.keyboard.press('Escape')
    await expect(popup).not.toBeVisible()
    await expect(button).toBeFocused()
    await button.click()
    await expect(popup.getByRole('button', { name: 'Hide details', exact: true })).toHaveCount(0)
    await popup.getByRole('button', { name: 'Done', exact: true }).click()
  }
  await expect(page).toHaveURL(/#\/student\/overview$/)
})

test('assessment details fit phones and keep keyboard focus inside the popup', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await mockAssessments(page)
  await page.getByRole('article', { name: 'Available CLI practicals', exact: true }).getByRole('button', { name: 'Show Details', exact: true }).click()
  const popup = page.getByRole('dialog', { name: 'Available CLI practicals', exact: true })
  await page.screenshot({ path: testInfo.outputPath('assessment-items-phone-collapsed.png') })
  await popup.locator('.student-assessment-details__item').filter({ has: page.getByRole('heading', { name: 'Switch configuration practical', exact: true }) }).getByRole('button', { name: 'Show details', exact: true }).click()
  await expect(popup.getByText('SRWE-01', { exact: true })).toBeVisible()
  await expect(popup.getByText('switch', { exact: true })).toBeVisible()
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press('Tab')
    expect(await popup.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  await popup.getByRole('button', { name: 'Close details', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(popup.getByRole('button', { name: 'View practicals', exact: true })).toBeFocused()
  expect(await popup.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await popup.getByRole('button', { name: 'Close details', exact: true }).focus()
  await popup.evaluate((element) => { element.scrollTop = 0 })
  await page.screenshot({ path: testInfo.outputPath('assessment-details-phone.png') })
  await popup.getByRole('button', { name: 'Close details', exact: true }).click()
  await expect(popup).not.toBeVisible()
})
