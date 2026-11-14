import { expect, test } from '@playwright/test'

async function mockEditor(page) {
  const course = { id: 1, code: 'ITN', title: 'Introduction to Networks' }
  const quiz = { id: 'quiz-one', course_id: 1, title: 'Existing quiz', courses: course, status: 'draft', duration_minutes: 15, max_attempts: 1, passing_score: 70, quiz_questions: [] }
  const lab = { id: 'lab-one', courseId: 1, courseCode: 'ITN', title: 'Existing practical', instructions: 'Configure the device.', status: 'draft', durationMinutes: 30, maxAttempts: 1, passingScore: 70, deviceType: 'switch', classIds: [], criteria: [] }
  const controls = { writes: [], policyFails: false, policy: { allowReview: true, availableFrom: '2020-01-01T01:00:00.000Z', availableUntil: '2020-01-01T02:00:00.000Z' }, topologyWrites: 0 }
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'get_assessment_review_policy') {
      await route.fulfill(controls.policyFails ? { status: 500, json: { message: 'Settings unavailable' } } : { json: controls.policy })
      return
    }
    if (['save_instructor_quiz_with_review', 'save_cli_lab_with_review'].includes(endpoint)) {
      controls.writes.push({ endpoint, payload: route.request().postDataJSON().p_payload })
      await route.fulfill({ json: 'saved-assessment' }); return
    }
    if (endpoint === 'save_cli_lab_topology') controls.topologyWrites += 1
    const data = { quizzes: [quiz], courses: [course], get_instructor_cli_workspace: { labs: [lab], classes: [] }, get_cli_lab_topology_data: [{ id: 'lab-one', devices: [{ id: 'device-1', label: 'Access switch', hostname: 'Switch', type: 'switch' }], topology: { links: [] } }] }
    await route.fulfill({ json: data[endpoint] ?? [] })
  })
  return controls
}

for (const feature of ['quizzes', 'practicals']) {
  const isQuiz = feature === 'quizzes'
  const editorSelector = isQuiz ? '.quiz-editor' : '.cli-lab-editor'
  const titleLabel = isQuiz ? 'Quiz title' : 'Practical title'
  const createLabel = isQuiz ? 'Create quiz' : 'Create practical'
  const saveLabel = isQuiz ? 'Save changes' : 'Save practical'
  const expectedEndpoint = isQuiz ? 'save_instructor_quiz_with_review' : 'save_cli_lab_with_review'

  test(`${feature} creation defaults review off and saves local scheduled bounds atomically`, async ({ page }, testInfo) => {
    const controls = await mockEditor(page)
    await page.goto(`/?uat-role=instructor#/instructor/${feature}/editor`)
    const editor = page.locator(editorSelector)
    await editor.getByRole('combobox', { name: 'Course', exact: true }).selectOption('1')
    await editor.getByLabel(titleLabel, { exact: true }).fill('Scheduled assessment')
    if (!isQuiz) await editor.getByLabel('Student instructions', { exact: true }).fill('Configure the switch.')
    const enable = editor.getByRole('checkbox', { name: 'Allow students to review completed attempts' })
    await expect(enable).not.toBeChecked()
    expect(await enable.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThan(24)
    await enable.check()
    await expect(editor.locator('.review-schedule-fields__enable span')).toBeInViewport()
    await editor.getByRole('combobox', { name: 'Review availability', exact: true }).selectOption('scheduled')
    await editor.getByLabel('Review opens', { exact: true }).fill('2020-01-01T09:00')
    await editor.getByLabel('Review closes (optional)', { exact: true }).fill('2020-01-01T08:00')
    await editor.getByRole('button', { name: createLabel, exact: true }).click()
    await expect(page.getByText('Review closes must be later than review opens.', { exact: true })).toBeVisible()
    expect(controls.writes).toHaveLength(0)
    await editor.getByLabel('Review closes (optional)', { exact: true }).fill('2020-01-01T10:00')
    await editor.locator('.review-schedule-fields').screenshot({ path: testInfo.outputPath('review-schedule-fields.png') })
    await editor.getByRole('button', { name: createLabel, exact: true }).click()
    await expect.poll(() => controls.writes.length).toBe(1)
    const dates = await page.evaluate(() => ({ availableFrom: new Date('2020-01-01T09:00').toISOString(), availableUntil: new Date('2020-01-01T10:00').toISOString() }))
    expect(controls.writes[0].endpoint).toBe(expectedEndpoint)
    expect(controls.writes[0].payload.reviewPolicy).toEqual({ allowReview: true, ...dates })
    expect(controls.topologyWrites).toBe(0)
  })

  test(`${feature} editing preserves saved schedule and clears bounds for immediate review`, async ({ page }) => {
    const controls = await mockEditor(page)
    await page.goto(`/?uat-role=instructor#/instructor/${feature}`)
    await page.getByRole('button', { name: isQuiz ? 'Show quizzes' : 'Show practicals', exact: true }).click()
    await page.getByRole('button', { name: 'Show details', exact: true }).click()
    const popup = page.getByRole('dialog', { name: isQuiz ? 'Existing quiz' : 'Existing practical', exact: true })
    await popup.getByRole('button', { name: isQuiz ? 'Edit quiz' : 'Edit', exact: true }).click()
    const editor = page.locator(editorSelector)
    await expect(editor.getByRole('combobox', { name: 'Review availability', exact: true })).toHaveValue('scheduled')
    const expectedLocal = await page.evaluate((iso) => { const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }, controls.policy.availableFrom)
    await expect(editor.getByLabel('Review opens', { exact: true })).toHaveValue(expectedLocal)
    await editor.getByRole('combobox', { name: 'Review availability', exact: true }).selectOption('immediate')
    await editor.getByRole('button', { name: saveLabel, exact: true }).click()
    await expect.poll(() => controls.writes.length).toBe(1)
    expect(controls.writes[0].payload.reviewPolicy).toEqual({ allowReview: true, availableFrom: null, availableUntil: null })
  })

  test(`${feature} existing policy errors block save, retry preserves other draft edits`, async ({ page }) => {
    const controls = await mockEditor(page)
    controls.policyFails = true
    await page.goto(`/?uat-role=instructor#/instructor/${feature}`)
    await page.getByRole('button', { name: isQuiz ? 'Show quizzes' : 'Show practicals', exact: true }).click()
    await page.getByRole('button', { name: 'Show details', exact: true }).click()
    await page.getByRole('dialog', { name: isQuiz ? 'Existing quiz' : 'Existing practical', exact: true }).getByRole('button', { name: isQuiz ? 'Edit quiz' : 'Edit', exact: true }).click()
    const editor = page.locator(editorSelector)
    await expect(editor.getByRole('button', { name: 'Reload review settings', exact: true })).toBeVisible()
    await editor.getByLabel(titleLabel, { exact: true }).fill('Retained draft title')
    await expect(editor.getByRole('button', { name: saveLabel, exact: true })).toBeDisabled()
    expect(controls.writes).toHaveLength(0)
    controls.policyFails = false
    await editor.getByRole('button', { name: 'Reload review settings', exact: true }).click()
    await expect(editor.getByRole('button', { name: saveLabel, exact: true })).toBeEnabled()
    await expect(editor.getByLabel(titleLabel, { exact: true })).toHaveValue('Retained draft title')
    await editor.getByRole('checkbox', { name: 'Allow students to review completed attempts' }).uncheck()
    await editor.getByRole('button', { name: saveLabel, exact: true }).click()
    await expect.poll(() => controls.writes.length).toBe(1)
    expect(controls.writes[0].payload.reviewPolicy).toEqual({ allowReview: false, availableFrom: null, availableUntil: null })
  })
}
