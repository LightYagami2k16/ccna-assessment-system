import { expect, test } from '@playwright/test'

async function mockMonitor(page, { failSubmit = false, metadataMissing = false } = {}) {
  const writes = []
  const attempts = [
    { attemptId: 'quiz-a1', assessmentId: 'quiz-a', assessmentType: 'quiz', studentId: 'student-a', studentName: 'Alice', studentEmail: 'alice@example.test', classId: 'class-a', classCode: 'A', className: 'Class A' },
    { attemptId: 'quiz-b1', assessmentId: 'quiz-b', assessmentType: 'quiz', studentId: 'student-b', studentName: 'Bob', studentEmail: 'bob@example.test', classId: 'class-a', classCode: 'A', className: 'Class A' },
    { attemptId: 'cli-a1', assessmentId: 'cli-a', assessmentType: 'cli', studentId: 'student-c', studentName: 'Carol', studentEmail: 'carol@example.test', classId: 'class-b', classCode: 'B', className: 'Class B' },
  ].map((attempt) => ({ ...attempt, assessmentTitle: 'Module 1 assessment', quizTitle: 'Module 1 assessment', startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), eventCount: 0 }))
  const ended = new Set()
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'instructor_submit_assessment_attempt') {
      const payload = route.request().postDataJSON()
      writes.push(payload)
      if (failSubmit) return route.fulfill({ status: 403, json: { message: 'You cannot submit this attempt.' } })
      ended.add(payload.p_attempt_id)
      return route.fulfill({ json: { attemptId: payload.p_attempt_id, status: 'submitted' } })
    }
    if (endpoint === 'get_live_attempt_assessment_context' && metadataMissing) {
      return route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Function not found' } })
    }
    const active = attempts.filter((attempt) => !ended.has(attempt.attemptId))
    const data = {
      get_exam_controls_workspace: { students: [], quizzes: [], assignments: [], accommodations: [], activeAttempts: active.filter((a) => a.assessmentType === 'quiz') },
      get_cli_live_monitoring_attempts: active.filter((a) => a.assessmentType === 'cli'),
      get_live_attempt_class_context: active,
      get_live_attempt_assessment_context: active,
    }
    await route.fulfill({ json: data[endpoint] ?? [] })
  })
  return writes
}

for (const role of ['instructor', 'administrator']) {
  test(`${role} filters exact assessments and confirms a monitored submission`, async ({ page }) => {
    test.setTimeout(120000)
    const writes = await mockMonitor(page)
    await page.setViewportSize({ width: role === 'instructor' ? 390 : 1440, height: 1000 })
    const base = role === 'instructor' ? '/instructor/exam-controls' : '/admin/assessment-tools/exam-controls'
    await page.goto(`/?uat-role=${role}#${base}/monitoring`)
    const monitor = page.locator('.live-attempt-monitor')
    await expect(monitor.getByRole('combobox', { name: 'Assessment', exact: true })).toBeVisible()
    await monitor.getByRole('combobox', { name: 'Assessment', exact: true }).selectOption('quiz:quiz-b')
    await expect(monitor.getByText('Bob', { exact: true })).toBeVisible()
    await expect(monitor.getByText('Alice', { exact: true })).toHaveCount(0)
    await expect(monitor.getByText('Carol', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Refresh now', exact: true }).click()
    await expect(monitor.getByRole('combobox', { name: 'Assessment', exact: true })).toHaveValue('quiz:quiz-b')
    await monitor.getByRole('button', { name: 'Show details', exact: true }).click()
    await monitor.getByRole('button', { name: 'Submit attempt', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('Bob')
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(writes).toHaveLength(0)
    await monitor.getByRole('button', { name: 'Submit attempt', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Submit attempt', exact: true }).click()
    await expect(monitor.getByText('No matching active attempts', { exact: true })).toBeVisible()
    expect(writes).toEqual([{ p_assessment_type: 'quiz', p_attempt_id: 'quiz-b1' }])
    await monitor.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await monitor.getByRole('combobox', { name: 'Assessment type', exact: true }).selectOption('cli')
    await expect(monitor.getByText('Carol', { exact: true })).toBeVisible()
    await expect(monitor.getByText('Alice', { exact: true })).toHaveCount(0)
    await monitor.getByRole('button', { name: 'Show details', exact: true }).click()
    await monitor.getByRole('button', { name: 'Submit attempt', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Submit attempt', exact: true }).click()
    await expect.poll(() => writes.length).toBe(2)
    expect(writes[1]).toEqual({ p_assessment_type: 'cli', p_attempt_id: 'cli-a1' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  })
}

test('submission errors remain visible and a missing migration disables submission', async ({ page }) => {
  await mockMonitor(page, { failSubmit: true })
  await page.goto('/?uat-role=instructor#/instructor/exam-controls/monitoring')
  const monitor = page.locator('.live-attempt-monitor')
  await monitor.getByRole('combobox', { name: 'Assessment', exact: true }).selectOption('quiz:quiz-a')
  await monitor.getByRole('button', { name: 'Show details', exact: true }).click()
  await monitor.getByRole('button', { name: 'Submit attempt', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Submit attempt', exact: true }).click()
  await expect(monitor.getByRole('alert')).toContainText('You cannot submit this attempt.')
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click()
  await expect(monitor.getByRole('alert')).toContainText('You cannot submit this attempt.')
  await page.unrouteAll({ behavior: 'wait' })
  await mockMonitor(page, { metadataMissing: true })
  await page.reload()
  await expect(monitor.getByRole('status')).toContainText('migration 068')
  await monitor.getByRole('combobox', { name: 'Assessment type', exact: true }).selectOption('cli')
  await monitor.getByRole('button', { name: 'Show details', exact: true }).click()
  await expect(monitor.getByRole('button', { name: 'Submit attempt', exact: true })).toBeDisabled()
})

test('student attempt details start collapsed and expand independently across refreshes', async ({ page }) => {
  await page.clock.install()
  await mockMonitor(page)
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.goto('/?uat-role=instructor#/instructor/exam-controls/monitoring')
  const monitor = page.locator('.live-attempt-monitor')
  await monitor.getByRole('combobox', { name: 'Class', exact: true }).selectOption('class-a')
  const alice = monitor.locator('.monitor-card').filter({ hasText: 'Alice' })
  const bob = monitor.locator('.monitor-card').filter({ hasText: 'Bob' })
  await expect(alice.getByRole('button', { name: 'Show details', exact: true })).toHaveAttribute('aria-expanded', 'false')
  await expect(alice.getByText('Started', { exact: true })).toBeHidden()
  await expect(alice.getByRole('button', { name: 'Submit attempt', exact: true })).toBeHidden()
  await alice.getByRole('button', { name: 'Show details', exact: true }).click()
  await expect(alice.getByRole('button', { name: 'Hide details', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect(alice.getByText('Started', { exact: true })).toBeVisible()
  await expect(bob.getByText('Started', { exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click()
  await page.clock.runFor(11000)
  await expect(alice.getByRole('button', { name: 'Hide details', exact: true })).toBeVisible()
  await expect(bob.getByRole('button', { name: 'Show details', exact: true })).toBeVisible()
  await alice.getByRole('button', { name: 'Hide details', exact: true }).click()
  await expect(alice.getByText('Started', { exact: true })).toBeHidden()
  await expect(bob.getByText('Started', { exact: true })).toBeHidden()
})

test('class/type filters and expansion survive subsection switches and polling', async ({ page }) => {
  await page.clock.install()
  await mockMonitor(page)
  await page.goto('/?uat-role=instructor#/instructor/exam-controls/monitoring')
  const monitor = page.locator('.live-attempt-monitor')
  await monitor.locator('.monitor-class-summary').filter({ hasText: 'Class A' }).click()
  await monitor.locator('.monitor-assessment-summary').first().click()
  await expect(monitor.getByText('Alice', { exact: true })).toHaveCount(0)
  await monitor.getByRole('combobox', { name: 'Class', exact: true }).selectOption('class-a')
  await expect(monitor.locator('.monitor-assessment-group')).toHaveCount(2)
  await expect(monitor.getByText('Alice', { exact: true })).toBeVisible()
  await expect(monitor.getByText('Bob', { exact: true })).toBeVisible()
  await expect(monitor.getByText('Carol', { exact: true })).toHaveCount(0)
  await monitor.getByRole('combobox', { name: 'Assessment type', exact: true }).selectOption('quiz')
  await monitor.getByRole('combobox', { name: 'Assessment', exact: true }).selectOption('quiz:quiz-a')
  const navigation = page.getByRole('navigation', { name: 'Exam controls sections' })
  await navigation.getByRole('button', { name: 'Integrity enforcement', exact: true }).click()
  await navigation.getByRole('button', { name: 'Live monitoring', exact: true }).click()
  await page.clock.runFor(11000)
  await expect(monitor.getByRole('combobox', { name: 'Class', exact: true })).toHaveValue('class-a')
  await expect(monitor.getByRole('combobox', { name: 'Assessment type', exact: true })).toHaveValue('quiz')
  await expect(monitor.getByRole('combobox', { name: 'Assessment', exact: true })).toHaveValue('quiz:quiz-a')
  await expect(monitor.getByText('Alice', { exact: true })).toBeVisible()
  await monitor.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(monitor.getByText('Alice', { exact: true })).toHaveCount(0)
  await expect(monitor.getByText('Bob', { exact: true })).toBeVisible()
})

test('student-name search combines with monitoring filters and survives refresh', async ({ page }) => {
  await page.clock.install()
  await mockMonitor(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/?uat-role=instructor#/instructor/exam-controls/monitoring')
  const monitor = page.locator('.live-attempt-monitor')
  const search = monitor.getByRole('searchbox', { name: 'Student name', exact: true })
  await search.fill('  aLi  ')
  await expect(monitor.getByText('Alice', { exact: true })).toBeVisible()
  await expect(monitor.getByText('Bob', { exact: true })).toHaveCount(0)
  await expect(monitor.getByText('Carol', { exact: true })).toHaveCount(0)
  const searchBox = await search.boundingBox()
  const classBox = await monitor.getByRole('combobox', { name: 'Class', exact: true }).boundingBox()
  expect(searchBox.x).toBeLessThan(classBox.x)
  expect(Math.abs(searchBox.y - classBox.y)).toBeLessThanOrEqual(1)
  await monitor.getByRole('combobox', { name: 'Assessment type', exact: true }).selectOption('cli')
  await expect(monitor.getByText('No matching active attempts', { exact: true })).toBeVisible()
  await monitor.getByRole('combobox', { name: 'Assessment type', exact: true }).selectOption('quiz')
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click()
  await page.clock.runFor(11000)
  await expect(search).toHaveValue('  aLi  ')
  await expect(monitor.getByText('Alice', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 1000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  await monitor.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(search).toHaveValue('')
  await expect(monitor.getByRole('combobox', { name: 'Assessment type', exact: true })).toHaveValue('all')
  await expect(monitor.locator('.monitor-filter-count')).toHaveText('Showing 3 of 3 active attempts.')
})
