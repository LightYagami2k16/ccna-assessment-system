import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/?uat-role=student#/student/guide')
})

test('student exam guide can be hidden and reopened', async ({ page }) => {
  const guide = page.getByRole('region', { name: 'How to take an exam' })
  await expect(guide).toBeVisible()
  await expect(guide.getByText('Start only when ready.')).toBeVisible()

  await guide.getByRole('button', { name: 'Hide guide' }).click()
  await expect(guide.getByText('Start only when ready.')).toBeHidden()
  await guide.getByRole('button', { name: 'View guide' }).click()
  await expect(guide.getByText('If internet is interrupted.')).toBeVisible()
})

test('student exam guide fits a compact phone and remains keyboard accessible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const toggle = page.getByRole('button', { name: /guide$/i })
  await toggle.focus()
  await expect(toggle).toBeFocused()
  await page.keyboard.press('Enter')

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})
