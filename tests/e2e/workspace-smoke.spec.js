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
