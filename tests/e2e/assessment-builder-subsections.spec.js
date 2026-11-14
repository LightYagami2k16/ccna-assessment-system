import { expect, test } from '@playwright/test'

async function mockBuilders(page, writes = []) {
  const course = { id: 1, code: 'ITN', title: 'Introduction to Networks' }
  const quiz = { id: 'quiz-one', course_id: 1, title: 'Existing quiz', courses: course,
    status: 'draft', duration_minutes: 15, max_attempts: 1, passing_score: 70,
    created_at: '2026-11-12T00:00:00Z', quiz_questions: [] }
  const lab = { id: 'lab-one', courseId: 1, courseCode: 'ITN', title: 'Existing practical',
    instructions: 'Configure the assigned device.',
    status: 'draft', durationMinutes: 30, maxAttempts: 1, passingScore: 70,
    deviceType: 'switch', initialHostname: 'Switch', classIds: [], criteria: [] }
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (['save_instructor_quiz', 'save_cli_lab', 'save_instructor_quiz_with_review', 'save_cli_lab_with_review'].includes(endpoint)) {
      writes.push({ endpoint, payload: route.request().postDataJSON().p_payload })
      await route.fulfill({ json: 'saved-assessment' })
      return
    }
    if (endpoint === 'get_assessment_review_policy') return route.fulfill({ json: { allowReview: false, availableFrom: null, availableUntil: null } })
    await route.fulfill({ json: endpoint === 'get_instructor_cli_workspace'
      ? { labs: [lab], classes: [] }
      : endpoint === 'quizzes' ? [quiz] : endpoint === 'courses' ? [course] : [] })
  })
}

for (const feature of ['quizzes', 'practicals']) {
  test(`${feature} successful creation returns to library and resets completed draft`, async ({ page }) => {
    const writes = []
    await mockBuilders(page, writes)
    const isQuiz = feature === 'quizzes'
    const base = `/instructor/${feature}`
    await page.goto(`/?uat-role=instructor#${base}/editor`)
    const navigation = page.getByRole('navigation', { name: isQuiz ? 'Quiz sections' : 'CLI practical sections' })
    const editor = page.locator(isQuiz ? '.quiz-editor' : '.cli-lab-editor')
    await editor.getByRole('combobox', { name: 'Course', exact: true }).selectOption('1')
    await editor.getByLabel(isQuiz ? 'Quiz title' : 'Practical title', { exact: true }).fill('Saved assessment')
    if (!isQuiz) await editor.getByRole('textbox', { name: 'Student instructions', exact: true }).fill('Configure the assigned device.')
    await editor.getByRole('button', { name: isQuiz ? 'Create quiz' : 'Create practical', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`#${base}$`))
    expect(writes).toHaveLength(1)
    expect(writes[0].payload.title).toBe('Saved assessment')
    await navigation.getByRole('button', { name: isQuiz ? 'Create / edit quiz' : 'Create / edit practical', exact: true }).click()
    await expect(editor.getByLabel(isQuiz ? 'Quiz title' : 'Practical title', { exact: true })).toHaveValue('')
  })
}

for (const role of ['instructor', 'administrator']) {
  for (const feature of ['quizzes', 'cli-practicals']) {
    test(`${role} ${feature} subsections retain drafts and restore navigation`, async ({ page }) => {
      test.setTimeout(180_000)
      await mockBuilders(page)
      await page.setViewportSize({ width: role === 'instructor' ? 390 : 1440, height: 1000 })
      const isQuiz = feature === 'quizzes'
      const path = isQuiz ? 'quizzes' : 'practicals'
      const base = role === 'instructor' ? `/instructor/${path}` : `/admin/assessment-tools/${path}`
      await page.goto(`/?uat-role=${role}#${base}`)
      const documentStartedAt = await page.evaluate(() => performance.timeOrigin)
      const navigation = page.getByRole('navigation', { name: isQuiz ? 'Quiz sections' : 'CLI practical sections' })
      await expect(navigation.getByRole('button')).toHaveCount(3)
      await page.getByRole('button', { name: isQuiz ? 'Show quizzes' : 'Show practicals', exact: true }).click()
      const library = page.locator(isQuiz ? '#quizzes-subsection-library' : '#cli-practicals-subsection-library')
      const selection = library.getByRole('checkbox', { name: isQuiz ? 'Select all quizzes' : 'Select all practicals', exact: true })
      await selection.check()
      await navigation.getByRole('button', { name: isQuiz ? 'Create / edit quiz' : 'Create / edit practical', exact: true }).click()
      await page.waitForURL(`**#${base}/editor`)
      const editor = page.locator(isQuiz ? '.quiz-editor' : '.cli-lab-editor')
      const title = editor.getByLabel(isQuiz ? 'Quiz title' : 'Practical title', { exact: true })
      await title.fill('Retained assessment draft')
      await navigation.getByRole('button', { name: 'Templates', exact: true }).click()
      await page.waitForURL(`**#${base}/templates`)
      await expect(editor).toBeHidden()
      await navigation.getByRole('button', { name: isQuiz ? 'Create / edit quiz' : 'Create / edit practical', exact: true }).click()
      await page.waitForURL(`**#${base}/editor`)
      await expect(title).toHaveValue('Retained assessment draft')
      await page.goBack()
      await page.waitForURL(`**#${base}/templates`)
      await expect(navigation.getByRole('button', { name: 'Templates', exact: true })).toHaveAttribute('aria-current', 'page')
      await page.goForward()
      await page.waitForURL(`**#${base}/editor`)
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStartedAt)
      await expect(title).toHaveValue('Retained assessment draft')
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`#${base}$`))
      await expect(selection).toBeChecked()
      await library.getByRole('button', { name: 'Show details', exact: true }).click()
      await page.getByRole('dialog', { name: isQuiz ? 'Existing quiz' : 'Existing practical', exact: true }).getByRole('button', { name: isQuiz ? 'Edit quiz' : 'Edit', exact: true }).click()
      await expect(title).toHaveValue(isQuiz ? 'Existing quiz' : 'Existing practical')
      await title.fill('Edited assessment')
      await editor.getByRole('button', { name: isQuiz ? 'Save changes' : 'Save practical', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`#${base}$`))
      await expect(selection).toBeChecked()
      await navigation.getByRole('button', { name: 'Templates', exact: true }).click()
      await page.reload()
      await expect(navigation.getByRole('button', { name: 'Templates', exact: true })).toHaveAttribute('aria-current', 'page')
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    })
  }
}
