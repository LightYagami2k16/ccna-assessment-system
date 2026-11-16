import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = { get_student_active_assessment_session: null, get_assignment_workspace: { students: [], classes: [], approvalRequests: [], quizzes: [] }, get_instructor_cli_workspace: { labs: [], classes: [] } }
    return route.fulfill({ json: data[endpoint] ?? [] })
  })
})

test('administrator tools use a single shell and retain nested routes through history', async ({ page }, testInfo) => {
  await page.goto('/?uat-role=administrator#/admin/assessment-tools/quizzes/editor')
  const selector = page.getByRole('combobox', { name: 'Assessment tool', exact: true })
  await expect(selector).toBeVisible({ timeout: 45000 })
  await expect(page.getByRole('navigation', { name: 'Instructor tools', exact: true })).toHaveCount(0)
  await expect(page.locator('.workspace-page-header')).toHaveCount(1)
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb', exact: true })
  await expect(crumbs).toContainText('Overview')
  await expect(crumbs).toContainText('Assessment tools')
  await expect(crumbs).toContainText('Quizzes')
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Create / edit quiz')
  await page.getByLabel('Quiz title', { exact: true }).fill('Retained quiz draft')
  await page.getByRole('navigation', { name: 'Quiz sections', exact: true }).getByRole('button', { name: 'Templates', exact: true }).click()
  await crumbs.getByRole('link', { name: 'Quizzes', exact: true }).click()
  await expect(page).toHaveURL(/#\/admin\/assessment-tools\/quizzes$/)
  await page.getByRole('navigation', { name: 'Quiz sections', exact: true }).getByRole('button', { name: 'Create / edit quiz', exact: true }).click()
  await expect(page.getByLabel('Quiz title', { exact: true })).toHaveValue('Retained quiz draft')
  await selector.selectOption('cli-practicals')
  await expect(page).toHaveURL(/#\/admin\/assessment-tools\/practicals$/)
  await page.goBack()
  await expect(selector).toHaveValue('quizzes')
  await page.reload()
  await expect(selector).toHaveValue('quizzes')
  await expect(page.locator('.workspace-page-header')).toHaveCount(1)
  await crumbs.getByRole('link', { name: 'Assessment tools', exact: true }).click()
  await expect(selector).toHaveValue('questions')
  await expect(page).toHaveURL(/#\/admin\/assessment-tools\/question-bank$/)
  await expect(page.locator('#main-workspace-content')).toBeFocused()
  await page.setViewportSize({ width: 390, height: 1000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('admin-single-shell-phone.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('admin-single-shell-desktop.png'), fullPage: true })
})

for (const [role, path, current] of [['instructor', '/instructor/classes/enrollment', 'Enrollment approvals'], ['student', '/student/practicals', 'CLI practicals']]) {
  test(`${role} breadcrumbs return to the owning overview`, async ({ page }) => {
    await page.goto(`/?uat-role=${role}#${path}`)
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb', exact: true })
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText(current, { timeout: 45000 })
    await crumbs.getByRole('link', { name: 'Overview', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`#/${role}/overview$`))
  })
}
