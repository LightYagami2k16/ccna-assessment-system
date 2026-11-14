import { expect, test } from '@playwright/test'

for (const width of [1920, 390]) {
  test(`CLI cards retain their own size when a details popup opens at ${width}px`, async ({ page }) => {
    const labs = ['one', 'two', 'three'].map((id) => ({
      id,
      title: `CLI practical ${id}`,
      courseId: 1,
      courseCode: 'ITN',
      moduleCode: 'ITN-1',
      deviceType: 'switch',
      initialHostname: 'Switch',
      status: 'published',
      durationMinutes: 30,
      criteria: [],
      classIds: [],
      attemptCount: 0,
    }))
    await page.route('**/rest/v1/**', async (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      const data = {
        get_instructor_cli_workspace: { labs, classes: [] },
        courses: [{ id: 1, code: 'ITN', title: 'Introduction to Networks' }],
      }
      await route.fulfill({ json: data[endpoint] ?? [] })
    })
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/?uat-role=instructor#/instructor/practicals')
    await page.getByRole('button', { name: 'Show practicals', exact: true }).click()
    const cards = page.locator('.cli-practical-course-group .cli-lab-card')
    await expect(cards).toHaveCount(3)
    await page.evaluate(() => document.fonts.ready)
    const before = await cards.evaluateAll((elements) => elements.map((card) => {
      const box = card.getBoundingClientRect()
      return { height: box.height, width: box.width, x: box.x, y: box.y + window.scrollY }
    }))

    await cards.nth(0).getByRole('button', { name: 'Show details', exact: true }).click()
    const popup = page.getByRole('dialog', { name: 'CLI practical one', exact: true })
    await expect(popup).toBeVisible()
    for (const index of [0, 1, 2]) {
      const box = await cards.nth(index).boundingBox()
      expect(box.height).toBeCloseTo(before[index].height, 0)
      expect(box.width).toBeCloseTo(before[index].width, 0)
    }
    await popup.getByRole('button', { name: 'Show answer key', exact: true }).click()
    await expect(popup.getByRole('heading', { name: 'Answer key', exact: true })).toBeVisible()
    for (const index of [0, 1, 2]) expect((await cards.nth(index).boundingBox()).height).toBeCloseTo(before[index].height, 0)
    await popup.getByRole('button', { name: 'Close details', exact: true }).click()
    await cards.nth(1).getByRole('button', { name: 'Show details', exact: true }).click()
    const secondPopup = page.getByRole('dialog', { name: 'CLI practical two', exact: true })
    await expect(secondPopup).toBeVisible()
    await expect(secondPopup.getByRole('button', { name: 'Show answer key', exact: true })).toBeVisible()
    await secondPopup.getByRole('button', { name: 'Close details', exact: true }).click()
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1)
  })
}
