import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Manila' })

async function mockPolicy(page) {
  const policies = { quiz: false, cli: false }
  const windows = { quiz: { availableFrom: null, availableUntil: null }, cli: { availableFrom: null, availableUntil: null } }
  const state = { failRead: false, failSave: false, writes: [] }
  const course = { id: 1, code: 'ITN', title: 'Introduction to Networks' }
  const quiz = { id: 'quiz-one', course_id: 1, title: 'Review policy quiz', courses: course, status: 'draft', duration_minutes: 15, max_attempts: 1, passing_score: 70, quiz_questions: [] }
  const lab = { id: 'lab-one', courseId: 1, courseCode: 'ITN', title: 'Review policy practical', status: 'draft', durationMinutes: 30, maxAttempts: 1, criteria: [], classIds: [], deviceType: 'switch' }
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (['get_assessment_review_policy', 'set_assessment_review_policy', 'set_assessment_review_schedule'].includes(endpoint)) {
      const payload = route.request().postDataJSON()
      if ((endpoint.startsWith('get_') && state.failRead) || (endpoint.startsWith('set_') && state.failSave)) return route.fulfill({ status: 500, json: { message: 'Temporary review policy failure' } })
      if (endpoint.startsWith('set_')) { state.writes.push(payload); policies[payload.p_assessment_type] = payload.p_allow_review; windows[payload.p_assessment_type] = { availableFrom: payload.p_available_from ?? null, availableUntil: payload.p_available_until ?? null } }
      return route.fulfill({ json: { allowReview: policies[payload.p_assessment_type], ...windows[payload.p_assessment_type] } })
    }
    const data = { quizzes: [quiz], courses: [course], get_instructor_cli_workspace: { labs: [lab], classes: [] } }
    return route.fulfill({ json: data[endpoint] ?? [] })
  })
  return { state, policies }
}

for (const type of ['quiz', 'cli']) {
  test(`${type} review policy can be released, persisted, withdrawn, and retried after failure`, async ({ page }, testInfo) => {
    const { state, policies } = await mockPolicy(page)
    await page.setViewportSize({ width: type === 'quiz' ? 390 : 1440, height: 1000 })
    await page.goto(`/?uat-role=instructor#/instructor/${type === 'quiz' ? 'quizzes' : 'practicals'}`)
    await page.getByRole('button', { name: type === 'quiz' ? 'Show quizzes' : 'Show practicals', exact: true }).click()
    const card = page.locator(type === 'quiz' ? '.instructor-quiz-card' : '.cli-lab-card')
    await card.getByRole('button', { name: 'Show details', exact: true }).click()
    const popup = page.getByRole('dialog', { name: type === 'quiz' ? 'Review policy quiz' : 'Review policy practical', exact: true })
    const checkbox = popup.getByRole('checkbox', { name: 'Allow students to review completed attempts', exact: true })
    await expect(checkbox).toBeEnabled()
    await expect(checkbox).not.toBeChecked()
    await expect(popup.getByRole('button', { name: 'Save review access', exact: true })).toBeDisabled()
    await checkbox.check()
    await popup.getByRole('button', { name: 'Save review access', exact: true }).click()
    await expect(popup.getByText('Review access saved.', { exact: true })).toBeVisible()
    await popup.locator('.assessment-review-policy').screenshot({ path: testInfo.outputPath('instructor-review-policy.png') })
    expect(policies[type]).toBe(true)
    expect(state.writes[0]).toEqual({ p_assessment_type: type, p_assessment_id: type === 'quiz' ? 'quiz-one' : 'lab-one', p_allow_review: true, p_available_from: null, p_available_until: null })
    await popup.getByRole('button', { name: 'Done', exact: true }).click()
    await card.getByRole('button', { name: 'Show details', exact: true }).click()
    await expect(checkbox).toBeChecked()
    await checkbox.uncheck()
    state.failSave = true
    await popup.getByRole('button', { name: 'Save review access', exact: true }).click()
    await expect(popup.getByRole('alert')).toContainText('Review access could not be saved')
    await expect(checkbox).not.toBeChecked()
    expect(policies[type]).toBe(true)
    await expect(popup.getByRole('button', { name: type === 'quiz' ? 'Edit quiz' : 'Edit', exact: true })).toBeEnabled()
    state.failSave = false
    await popup.getByRole('button', { name: 'Save review access', exact: true }).click()
    await expect(popup.getByText('Review access saved.', { exact: true })).toBeVisible()
    expect(policies[type]).toBe(false)
  })
}

test('unavailable review policy does not block existing assessment actions and can recover', async ({ page }) => {
  const { state } = await mockPolicy(page)
  state.failRead = true
  await page.goto('/?uat-role=instructor#/instructor/quizzes')
  await page.getByRole('button', { name: 'Show quizzes', exact: true }).click()
  await page.locator('.instructor-quiz-card').getByRole('button', { name: 'Show details', exact: true }).click()
  const popup = page.getByRole('dialog', { name: 'Review policy quiz', exact: true })
  await expect(popup.getByRole('alert')).toContainText('Review settings are unavailable')
  await expect(popup.getByRole('button', { name: 'Edit quiz', exact: true })).toBeEnabled()
  state.failRead = false
  await popup.getByRole('button', { name: 'Retry review settings', exact: true }).click()
  await expect(popup.getByRole('checkbox', { name: 'Allow students to review completed attempts', exact: true })).toBeEnabled()
})

test('existing assessment review can use a local scheduled window and return to immediate access', async ({ page }) => {
  const { state } = await mockPolicy(page)
  await page.goto('/?uat-role=instructor#/instructor/quizzes')
  await page.getByRole('button', { name: 'Show quizzes', exact: true }).click()
  const card = page.locator('.instructor-quiz-card')
  await card.getByRole('button', { name: 'Show details', exact: true }).click()
  const popup = page.getByRole('dialog', { name: 'Review policy quiz', exact: true })
  await popup.getByRole('checkbox', { name: 'Allow students to review completed attempts', exact: true }).check()
  await popup.getByRole('combobox', { name: 'Review availability', exact: true }).selectOption('scheduled')
  const save = popup.getByRole('button', { name: 'Save review access', exact: true })
  await expect(save).toBeDisabled()
  await popup.getByLabel('Review opens', { exact: true }).fill('2099-01-11T10:00')
  await popup.getByLabel('Review closes (optional)', { exact: true }).fill('2099-01-11T09:00')
  await expect(save).toBeDisabled()
  await popup.getByLabel('Review closes (optional)', { exact: true }).fill('2099-01-11T11:00')
  await save.click()
  await expect(popup.getByText('Review access saved.', { exact: true })).toBeVisible()
  expect(state.writes.at(-1)).toEqual({ p_assessment_type: 'quiz', p_assessment_id: 'quiz-one', p_allow_review: true,
    p_available_from: '2099-01-11T02:00:00.000Z', p_available_until: '2099-01-11T03:00:00.000Z' })
  await popup.getByRole('button', { name: 'Done', exact: true }).click()
  await card.getByRole('button', { name: 'Show details', exact: true }).click()
  await expect(popup.getByLabel('Review opens', { exact: true })).toHaveValue('2099-01-11T10:00')
  await popup.getByRole('combobox', { name: 'Review availability', exact: true }).selectOption('immediate')
  await save.click()
  await expect(popup.getByText('Review access saved.', { exact: true })).toBeVisible()
  expect(state.writes.at(-1).p_available_from).toBe(null)
  expect(state.writes.at(-1).p_available_until).toBe(null)
})
