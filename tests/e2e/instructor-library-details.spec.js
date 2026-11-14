import { expect, test } from '@playwright/test'

async function mockLibrary(page) {
  const course = { id: 1, code: 'ITN', title: 'Introduction to Networks' }
  const quiz = { id: 'quiz-one', course_id: 1, title: 'Library quiz', courses: course, description: 'Quiz metadata description', status: 'draft', duration_minutes: 15, max_attempts: 2, passing_score: 70, quiz_questions: [] }
  const lab = { id: 'lab-one', courseId: 1, courseCode: 'ITN', title: 'Library practical', description: 'CLI metadata description', instructions: 'Configure the device.', status: 'draft', durationMinutes: 30, maxAttempts: 2, passingScore: 75, deviceType: 'switch', initialHostname: 'Switch', classIds: [], criteria: [] }
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = { get_assessment_review_policy: { allowReview: false, availableFrom: null, availableUntil: null }, quizzes: [quiz], courses: [course], get_instructor_cli_workspace: { labs: [lab], classes: [] } }
    return route.fulfill({ json: data[endpoint] ?? [] })
  })
}

for (const role of ['instructor', 'administrator']) {
  for (const feature of ['quizzes', 'practicals']) {
    test(`${role} ${feature} library uses compact cards and actionable detail popups`, async ({ page }, testInfo) => {
      await mockLibrary(page)
      await page.setViewportSize({ width: role === 'instructor' ? 390 : 1440, height: 950 })
      const base = role === 'instructor' ? `/instructor/${feature}` : `/admin/assessment-tools/${feature}`
      const isQuiz = feature === 'quizzes'
      const title = isQuiz ? 'Library quiz' : 'Library practical'
      await page.goto(`/?uat-role=${role}#${base}`)
      await expect(page.getByRole('button', { name: isQuiz ? 'Show quizzes' : 'Show practicals', exact: true })).toBeVisible({ timeout: 45000 })
      await page.getByRole('button', { name: isQuiz ? 'Show quizzes' : 'Show practicals', exact: true }).click()
      const card = page.locator(isQuiz ? '.instructor-quiz-card' : '.cli-lab-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      await expect(card.getByRole('button', { name: 'Show details', exact: true })).toBeVisible()
      await expect(card.getByRole('button')).toHaveCount(1)
      await expect(card.locator('dl')).toHaveCount(0)
      await card.getByRole('button', { name: 'Show details', exact: true }).click()
      const popup = page.getByRole('dialog', { name: title, exact: true })
      await expect(popup).toBeVisible()
      await expect(popup.getByText(isQuiz ? '15 minutes' : '30 minutes', { exact: true })).toBeVisible()
      await expect(popup.getByRole('button', { name: 'Duplicate draft', exact: true })).toBeEnabled()
      if (isQuiz) {
        await popup.getByRole('button', { name: 'Publish', exact: true }).click()
        const confirmation = page.getByRole('dialog', { name: 'Publish quiz?', exact: true })
        await expect(confirmation).toBeVisible()
        await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(popup.getByRole('button', { name: 'Publish', exact: true })).toBeFocused()
      } else {
        await popup.getByRole('checkbox', { name: 'Select', exact: true }).check()
        await popup.getByRole('button', { name: 'Show answer key', exact: true }).click()
        await expect(popup.getByRole('heading', { name: 'Answer key', exact: true })).toBeVisible()
      }
      await popup.getByRole('button', { name: 'Close details', exact: true }).focus()
      await page.keyboard.press('Shift+Tab')
      await expect(popup.getByRole('button', { name: 'Done', exact: true })).toBeFocused()
      await page.screenshot({ path: testInfo.outputPath('library-item-details.png') })
      await page.keyboard.press('Escape')
      await expect(popup).not.toBeVisible()
      await expect(card.getByRole('button', { name: 'Show details', exact: true })).toBeFocused()
      await card.getByRole('button', { name: 'Show details', exact: true }).click()
      await popup.getByRole('button', { name: isQuiz ? 'Edit quiz' : 'Edit', exact: true }).click()
      await expect(popup).not.toBeVisible()
      await expect(page).toHaveURL(new RegExp(`#${base}/editor$`))
      await expect(page.getByLabel(isQuiz ? 'Quiz title' : 'Practical title', { exact: true })).toHaveValue(title)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    })
  }
}
