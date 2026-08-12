import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'phone', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

const instructorTools = [
  'Question bank',
  'Quizzes',
  'CLI practicals',
  'Classes & assignments',
  'Exam controls',
  'Student results',
]

const studentTabs = [
  'Available Assigned quizzes',
  'CLI practicals Cisco configuration',
  'History Quiz and CLI results',
]

for (const viewport of viewports) {
  test(`instructor workspace fits a ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/?uat-role=instructor')
    await expect(
      page.getByRole('heading', { name: 'Welcome back, UAT Instructor' }),
    ).toBeVisible()
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await expect(page.getByRole('button', { name: 'Account settings' })).toBeVisible()

    for (const tool of instructorTools) {
      const mobileMenuButton = page.getByRole('button', { name: 'Open menu' })

      if (await mobileMenuButton.isVisible()) {
        await mobileMenuButton.click()
      }

      await page.getByRole('button', { name: new RegExp(`^${tool}`) }).click()
      await expect(page.locator('.workspace-page-header h1')).toHaveText(tool)

      const toolOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )

      expect(toolOverflow, `${tool} must fit the ${viewport.name} viewport`)
        .toBeLessThanOrEqual(1)
    }
  })
}

for (const viewport of viewports) {
  test(`student workspace fits a ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/?uat-role=student')

    await expect(
      page.getByRole('heading', { name: 'Welcome back, UAT Student' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'My assessments' }),
    ).toBeVisible()

    const welcomePosition = await page.locator('.welcome').boundingBox()
    const workspacePosition = await page
      .locator('.dashboard-role-content--student')
      .boundingBox()
    const catalogPosition = await page.locator('.dashboard-section').boundingBox()

    expect(workspacePosition?.y).toBeGreaterThan(welcomePosition?.y ?? 0)
    expect(catalogPosition?.y).toBeGreaterThan(workspacePosition?.y ?? 0)

    for (const tabName of studentTabs) {
      const tab = page.getByRole('tab', { name: tabName })
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')

      if (tabName.startsWith('Available')) {
        await expect(page.locator('.assessment-type-icon--quiz')).toBeVisible()
      }

      if (tabName.startsWith('CLI practicals')) {
        await expect(page.locator('.assessment-type-icon--cli')).toBeVisible()
      }

      if (tabName.startsWith('History')) {
        await expect(
          page.getByRole('heading', { name: 'Assessment history' }),
        ).toBeVisible()

        for (const filterName of ['All results', 'Quizzes', 'CLI practicals']) {
          const filter = page.getByRole('button', { name: new RegExp(`^${filterName}`) })
          await filter.click()
          await expect(filter).toHaveAttribute('aria-pressed', 'true')
        }
      }

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )

      expect(overflow, `${tabName} must fit the ${viewport.name} viewport`)
        .toBeLessThanOrEqual(1)
    }
  })
}
