import { expect, test } from '@playwright/test'

test('student workspace remains usable on the configured device', async ({ page }) => {
  await page.goto('/?uat-role=student')
  await expect(page.getByRole('heading', { name: 'My assessments' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Available/ })).toBeVisible()

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})
