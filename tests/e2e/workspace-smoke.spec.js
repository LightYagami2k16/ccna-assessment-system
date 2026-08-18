import { expect, test } from '@playwright/test'

const workspaces = [
  { role: 'student', heading: 'Welcome back, UAT Student' },
  { role: 'instructor', heading: 'Welcome back, UAT Instructor' },
  { role: 'administrator', heading: 'Welcome back, UAT Administrator' },
]

for (const workspace of workspaces) {
  test(`${workspace.role} workspace opens with its primary navigation`, async ({ page }) => {
    await page.goto(`/?uat-role=${workspace.role}`)
    await expect(page.getByRole('heading', { name: workspace.heading })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeAttached()
    await expect(page.getByRole('button', { name: 'Account settings' })).toBeVisible()
    await expect(page.locator('#main-workspace-content')).toBeVisible()
  })
}

test('account settings traps keyboard focus and closes with Escape', async ({ page }) => {
  await page.goto('/?uat-role=instructor')
  const settingsButton = page.getByRole('button', { name: 'Account settings' })
  await settingsButton.click()
  const dialog = page.getByRole('dialog', { name: 'Profile and security' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close settings' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(settingsButton).toBeFocused()
})

test('skip link moves keyboard focus to the main workspace', async ({ page }) => {
  await page.goto('/?uat-role=administrator')
  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await skipLink.focus()
  await expect(skipLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-workspace-content')).toBeFocused()
})

test('instructor page address survives refresh and browser navigation', async ({ page }) => {
  await page.goto('/?uat-role=instructor')
  await expect(page).toHaveURL(/#\/instructor\/overview$/)
  await expect(page.locator('.workspace-page-header h1')).toHaveText('Overview')

  await page
    .locator('#instructor-navigation')
    .getByRole('button', { name: /^Quizzes/ })
    .click()
  await expect(page).toHaveURL(/#\/instructor\/quizzes$/)
  await expect(
    page.locator('.instructor-workspace .workspace-page-header h1'),
  ).toHaveText('Quizzes')

  await page.getByRole('button', { name: /CLI practicals/ }).click()
  await expect(page).toHaveURL(/#\/instructor\/practicals$/)
  await page.goBack()
  await expect(page.locator('.workspace-page-header h1')).toHaveText('Quizzes')

  await page.reload()
  await expect(page.locator('.workspace-page-header h1')).toHaveText('Quizzes')
})

test('instructor overview shortcuts open focused tool pages', async ({ page }) => {
  await page.goto('/?uat-role=instructor#/instructor/overview')
  await expect(
    page.getByRole('heading', { name: 'Manage your CCNA assessments' }),
  ).toBeVisible()
  await expect(page.locator('.dashboard-section')).toHaveCount(0)

  await page.getByRole('button', { name: 'Manage classes' }).click()
  await expect(page).toHaveURL(/#\/instructor\/classes$/)
  await expect(page.locator('.workspace-page-header h1')).toHaveText(
    'Classes & assignments',
  )
})

test('a restricted role route returns to the signed-in workspace', async ({ page }) => {
  await page.goto('/?uat-role=student#/instructor/results')
  await expect(page).toHaveURL(/#\/student\/overview$/)
  await expect(
    page.getByText('That page is not available for your account.'),
  ).toBeVisible()
})

test('student pages keep their address through refresh and browser navigation', async ({ page }) => {
  await page.goto('/?uat-role=student#/student/overview')
  await expect(
    page.getByRole('heading', { name: 'Student overview' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'View quizzes' }).click()
  await expect(page).toHaveURL(/#\/student\/assessments$/)
  await expect(
    page.getByRole('heading', { name: 'Available quizzes' }),
  ).toBeVisible()

  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Available quizzes' }),
  ).toBeVisible()

  await page.goBack()
  await expect(
    page.getByRole('heading', { name: 'Student overview' }),
  ).toBeVisible()
})

test('administrator assessment tools keep administrator routing context', async ({ page }) => {
  await page.goto('/?uat-role=administrator#/admin/assessment-tools/quizzes')
  await expect(page.locator('.admin-page-header h1')).toHaveText('Assessment tools')
  await expect(
    page.locator('.instructor-workspace .workspace-page-header h1'),
  ).toHaveText('Quizzes')

  await page.getByRole('button', { name: /CLI practicals/ }).click()
  await expect(page).toHaveURL(/#\/admin\/assessment-tools\/practicals$/)
  await expect(page.locator('.admin-page-header h1')).toHaveText('Assessment tools')
  await expect(
    page.locator('.instructor-workspace .workspace-page-header h1'),
  ).toHaveText('CLI practicals')
})

test('administrator workspace opens on its overview', async ({ page }) => {
  await page.goto('/?uat-role=administrator')
  await expect(page).toHaveURL(/#\/admin\/overview$/)
  await expect(
    page.getByRole('heading', { name: 'Manage the assessment platform' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Manage accounts' }).click()
  await expect(page).toHaveURL(/#\/admin\/users$/)
  await expect(page.locator('.admin-page-header h1')).toHaveText(
    'User accounts',
  )
})

test('signed-out entry removes a previous protected workspace address', async ({ page }) => {
  await page.goto('/#/admin/users')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page).not.toHaveURL(/#\/admin\/users$/)
})
