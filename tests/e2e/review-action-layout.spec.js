import { expect, test } from '@playwright/test'

async function history(page) {
  const row = { attemptId: 'quiz-attempt', quizId: 'quiz-one', quizTitle: 'Network assessment', attemptNumber: 1, status: 'submitted', scorePoints: 47, maximumPoints: 50, percentage: 94, passed: true, submittedAt: '2026-08-21T06:27:00Z', courseCode: 'ITN' }
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = { get_student_active_assessment_session: null, get_student_recent_quiz_results: [row],
      get_student_cli_history: [{ ...row, attemptId: 'cli-attempt', labId: 'lab-one', title: 'Switch assessment', commandCount: 12 }],
      get_student_attempt_review_access: [{ assessmentType: 'quiz', attemptId: 'quiz-attempt' }, { assessmentType: 'cli', attemptId: 'cli-attempt' }] }
    return route.fulfill({ json: data[endpoint] ?? [] })
  })
  await page.goto('/?uat-role=student#/student/history')
  await expect(page.getByRole('heading', { name: 'Network assessment', exact: true })).toBeVisible({ timeout: 45000 })
}

for (const width of [1440, 740]) {
test(`history at ${width}px reserves a readable review column for quiz and practical actions`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 })
  await history(page)
  for (const selector of ['.student-recent-results:not(.student-cli-history)', '.student-cli-history']) {
    const panel = page.locator(selector)
    const heading = panel.getByRole('columnheader', { name: 'Review', exact: true })
    const button = panel.getByRole('button', { name: 'Review attempt 1', exact: true })
    await expect(button).toBeEnabled()
    const headerBox = await heading.boundingBox()
    expect(headerBox.width).toBeGreaterThanOrEqual(100)
    expect(headerBox.height).toBeLessThan(65)
    const box = await button.boundingBox()
    const cell = await button.locator('..').boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(90)
    expect(box.x).toBeGreaterThanOrEqual(cell.x)
    expect(box.x + box.width).toBeLessThanOrEqual(cell.x + cell.width + 1)
  }
  await page.locator('.student-assessment-history').screenshot({ path: testInfo.outputPath(`review-actions-${width}.png`) })
})

}

test('phone history keeps review actions within their result cards', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await history(page)
  for (const button of await page.getByRole('button', { name: 'Review attempt 1', exact: true }).all()) {
    await expect(button).toBeEnabled()
    const box = await button.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(90)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  await page.locator('.student-assessment-history').screenshot({ path: testInfo.outputPath('review-actions-phone.png') })
})
