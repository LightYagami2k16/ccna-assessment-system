import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const role of ['student', 'instructor', 'administrator']) {
  test(`${role} workspace has no serious accessibility violations`, async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`/?uat-role=${role}`)
    await expect(page.getByRole('heading', {
      name: `Welcome back, UAT ${role === 'administrator' ? 'Administrator' : role === 'instructor' ? 'Instructor' : 'Student'}`,
    })).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const serious = results.violations.filter(
      (violation) => ['serious', 'critical'].includes(violation.impact),
    )
    expect(serious.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    }))).toEqual([])
  })
}
