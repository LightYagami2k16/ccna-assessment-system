import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'phone', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

for (const viewport of viewports) {
  test(`instructor workspace fits a ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/?uat-role=instructor')
    await expect(page.getByRole('heading', { name: 'Welcome back, UAT Instructor' })).toBeVisible()
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await expect(page.getByRole('button', { name: 'Account settings' })).toBeVisible()
  })
}

