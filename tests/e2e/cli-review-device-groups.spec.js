import { expect, test } from '@playwright/test'

const criteria = [
  { deviceId: 'r1', type: 'hostname', expected: 'Router', points: 2, pointsAwarded: 2, met: true },
  { deviceId: 'r2', type: 'vlan_exists', target: '20', expected: '20', points: 1, pointsAwarded: 0, met: false },
  { deviceId: 'r1', type: 'config_saved', expected: 'Saved', points: 1, pointsAwarded: 1, met: true },
  { type: 'interface_enabled', target: 'GigabitEthernet0/0', expected: 'Enabled', points: 1, pointsAwarded: 0, met: false },
  { deviceId: 'retired-device', type: 'default_gateway', expected: '192.0.2.1', points: 1, pointsAwarded: 0, met: false },
]
const state = { deviceStates: { r1: { hostname: 'Router' }, r2: { hostname: 'Router' }, idle: { hostname: 'Idle PC' } } }
const commands = [{ deviceId: 'r1', sequence: 3, command: 'end', accepted: true }, { deviceId: 'r2', sequence: 2, command: 'show vlan', output: 'VLAN 20', accepted: true }, { deviceId: 'r1', sequence: 1, command: 'enable', accepted: true }, { sequence: 4, command: 'legacy command', output: 'Invalid command', accepted: false }]
const row = { attemptId: 'a1', labId: 'lab', title: 'Multi-device practical', labTitle: 'Multi-device practical', studentId: 'student', studentName: 'Test Student', studentEmail: 'test@example.test', classId: 'class', classCode: 'ITN-2A', className: 'Class A', courseCode: 'ITN', attemptNumber: 1, status: 'submitted', scorePoints: 3, maximumPoints: 6, percentage: 50, passed: false, submittedAt: '2026-11-16T00:00:00Z' }
for (const role of ['student', 'instructor']) {
  test(`${role} CLI review groups criteria by saved name and distinct device IDs`, async ({ page }, testInfo) => {
    await page.route('**/rest/v1/**', route => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      const data = {
        get_student_active_assessment_session: null,
        get_student_cli_history: [row], get_instructor_cli_results: [row],
        get_student_attempt_review_access: [{ assessmentType: 'cli', attemptId: 'a1' }],
        get_student_attempt_review: { assessmentType: 'cli', attempt: { ...row, id: 'a1' }, criteria, state, commands },
        get_instructor_cli_attempt_review: { attempt: { ...row, state }, criteria, commands },
      }
      return route.fulfill({ json: data[endpoint] ?? [] })
    })
    if (role === 'student') {
      await page.setViewportSize({ width: 390, height: 900 })
      await page.goto('/?uat-role=student#/student/history')
      await page.locator('.student-cli-history').getByRole('button', { name: 'Review attempt 1', exact: true }).click()
    } else {
      await page.goto('/?uat-role=instructor#/instructor/results/practicals')
      await page.getByRole('button', { name: 'Show students', exact: true }).click()
      await page.getByRole('button', { name: 'Show records', exact: true }).click()
      await page.getByRole('combobox', { name: 'Actions for CLI attempt 1 of Multi-device practical', exact: true }).selectOption('review')
      await page.locator('.result-action-menu').getByRole('button', { name: 'OK', exact: true }).click()
    }
    const panel = page.locator(role === 'student' ? '.student-attempt-review' : '.cli-attempt-review')
    const first = panel.getByRole('region', { name: 'Router (Device ID: r1)', exact: true })
    const second = panel.getByRole('region', { name: 'Router (Device ID: r2)', exact: true })
    await expect(first).toBeVisible({ timeout: 45000 })
    await expect(first.locator('article')).toHaveCount(2)
    await expect(second.locator('article')).toHaveCount(1)
    await expect(first).toContainText('Saved')
    await expect(first).not.toContainText('192.0.2.1')
    await expect(panel.getByRole('region', { name: 'Device name not recorded (Device ID not recorded)', exact: true })).toContainText('GigabitEthernet0/0')
    await expect(panel.getByRole('region', { name: 'Device name not recorded (Device ID: retired-device)', exact: true })).toContainText('192.0.2.1')
    const criteriaPanel = role === 'student'
      ? panel.getByRole('tabpanel', { name: 'Expected configuration', exact: true })
      : panel.getByRole('tabpanel', { name: 'Grading criteria', exact: true })
    const criteriaFilter = criteriaPanel.getByRole('combobox', { name: 'Filter by device', exact: true })
    const filterLabel = await criteriaFilter.locator('..').locator('label').boundingBox()
    const filterBox = await criteriaFilter.boundingBox()
    const heading = await criteriaPanel.getByRole('heading', { name: role === 'student' ? 'Expected configuration' : 'Grading criteria', exact: true }).boundingBox()
    expect(filterBox.y - filterLabel.y - filterLabel.height).toBeLessThanOrEqual(12)
    expect(filterLabel.y - heading.y - heading.height).toBeLessThanOrEqual(20)
    if (role === 'instructor') {
      await criteriaFilter.selectOption(JSON.stringify('r2'))
      await expect(first).toHaveCount(0)
      await expect(second.locator('article')).toHaveCount(1)
      const sections = panel.getByRole('tablist', { name: 'CLI attempt review sections', exact: true })
      const grading = sections.getByRole('tab', { name: 'Grading criteria', exact: true })
      await expect(grading).toHaveAttribute('aria-selected', 'true')
      await expect(panel.locator('.cli-review-command-log')).toBeHidden()
      await grading.focus()
      await page.keyboard.press('ArrowRight')
      await expect(sections.getByRole('tab', { name: 'Command log', exact: true })).toBeFocused()
      await expect(criteriaFilter).toBeHidden()
      await expect(panel.locator('.cli-review-summary')).toBeVisible()
    }
    if (role === 'student') {
      const sections = panel.getByRole('tablist', { name: 'CLI review sections', exact: true })
      await expect(sections.getByRole('tab', { name: 'Expected configuration', exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(panel.locator('.cli-review-command-log')).toBeHidden()
      const filter = criteriaPanel.getByRole('combobox', { name: 'Filter by device', exact: true })
      await filter.selectOption(JSON.stringify('r1'))
      await expect(first.locator('article')).toHaveCount(2)
      await expect(second).toHaveCount(0)
      await sections.getByRole('tab', { name: 'Expected configuration', exact: true }).focus()
      await page.keyboard.press('ArrowRight')
      await expect(sections.getByRole('tab', { name: 'Command log', exact: true })).toBeFocused()
      await expect(filter).toBeHidden()
    }
    const log = panel.locator('.cli-review-command-log')
    const commandFilter = log.getByRole('combobox', { name: 'Filter by device', exact: true })
    await expect(log.getByRole('tablist')).toHaveCount(0)
    await expect(commandFilter).toHaveValue('all')
    await expect(log.locator('.cli-review-command-list code')).toHaveCount(4)
    await commandFilter.selectOption(JSON.stringify('r1'))
    await expect(log.locator('.cli-review-command-list code')).toHaveText(['enable', 'end'])
    await commandFilter.selectOption(JSON.stringify('r2'))
    await expect(log.locator('.cli-review-command-list code')).toHaveText(['show vlan'])
    await expect(log).toContainText('VLAN 20')
    await commandFilter.selectOption(JSON.stringify('idle'))
    await expect(log).toContainText('No commands recorded for this device.')
    await commandFilter.selectOption('null')
    await expect(log.locator('.cli-review-command-list code')).toHaveText(['legacy command'])
    await expect(log).toContainText('Not accepted')
    await expect(panel.getByRole('heading', { name: 'Final device state', exact: true })).toHaveCount(0)
    await commandFilter.selectOption('all')
    await expect(log.locator('.cli-review-command-list code')).toHaveCount(4)
    await commandFilter.selectOption(JSON.stringify('r1'))
    if (role === 'student') {
      const sections = panel.getByRole('tablist', { name: 'CLI review sections', exact: true })
      await sections.getByRole('tab', { name: 'Expected configuration', exact: true }).click()
      const filter = criteriaPanel.getByRole('combobox', { name: 'Filter by device', exact: true })
      await expect(filter).toHaveValue(JSON.stringify('r1'))
      await filter.selectOption('all')
      await expect(second).toBeVisible()
      await filter.selectOption('null')
      await expect(first).toHaveCount(0)
      await expect(panel.getByRole('region', { name: 'Device name not recorded (Device ID not recorded)', exact: true })).toBeVisible()
      await filter.selectOption('all')
    }
    if (role === 'instructor') {
      const sections = panel.getByRole('tablist', { name: 'CLI attempt review sections', exact: true })
      await sections.getByRole('tab', { name: 'Grading criteria', exact: true }).click()
      await expect(criteriaFilter).toHaveValue(JSON.stringify('r2'))
      await expect(second).toBeVisible()
      await expect(log).toBeHidden()
      await page.keyboard.press('End')
      await expect(sections.getByRole('tab', { name: 'Command log', exact: true })).toBeFocused()
      await expect(commandFilter).toHaveValue(JSON.stringify('r1'))
      await page.keyboard.press('Home')
      await expect(sections.getByRole('tab', { name: 'Grading criteria', exact: true })).toBeFocused()
      await expect(panel.locator('.cli-review-summary')).toBeVisible()
      await page.setViewportSize({ width: 390, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      await page.screenshot({ path: testInfo.outputPath('instructor-review-tabs-phone.png'), fullPage: true })
      await page.setViewportSize({ width: 1280, height: 900 })
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: testInfo.outputPath(`${role}-device-groups.png`), fullPage: true })
  })
}
