import { expect, test } from '@playwright/test'

const students = [
  { id: 'ada', fullName: 'Ada Student', email: 'ada@example.test' },
  { id: 'ben', fullName: 'Ben Student', email: 'ben@example.test' },
  { id: 'outside', fullName: 'Not Enrolled', email: 'outside@example.test' },
]
const classes = [
  { id: 'a', name: 'Class A', studentIds: ['ada', 'ben'] },
  { id: 'b', name: 'Class B', studentIds: ['ben'] },
  { id: 'c', name: 'Class C', studentIds: ['ada'] },
  { id: 'd', name: 'Empty Class', studentIds: [] },
].map((classSection) => ({
  ...classSection,
  code: `ITN-${classSection.id}`,
  isActive: true,
  teacherName: 'Sample Teacher',
}))

for (const role of ['instructor', 'administrator']) {
  test(`${role} can find an enrolled student across class cards and clear the search`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: role === 'instructor' ? 320 : 1440, height: 900 })
    let deletedClassIds = null
    await page.route('**/rest/v1/**', async (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === 'delete_class_sections_bulk') deletedClassIds = route.request().postDataJSON().p_class_ids
      await route.fulfill({ json: endpoint === 'get_assignment_workspace' ? { students, classes, approvalRequests: [], quizzes: [] } : [] })
    })
    const path = role === 'instructor' ? '/instructor/classes' : '/admin/assessment-tools/classes'
    await page.goto(`/?uat-role=${role}#${path}`)
    const cards = page.locator('.class-card')
    await expect(cards).toHaveCount(4, { timeout: 45000 })
    async function openClass(name) {
      await cards.filter({ has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: 'Show details', exact: true }).click()
      return page.getByRole('dialog', { name, exact: true })
    }
    async function checkRoster(name, expected) {
      const popup = await openClass(name)
      const show = popup.getByRole('button', { name: 'Show students', exact: true })
      if (await show.isVisible()) await show.click()
      await expect(popup.locator('.class-card__student-identity strong')).toHaveText(expected)
      await popup.getByRole('button', { name: 'Done', exact: true }).click()
    }
    await checkRoster('Class A', ['Ada Student', 'Ben Student'])
    let popup = await openClass('Class B')
    await popup.getByRole('checkbox', { name: 'Select for deletion', exact: true }).check()
    await popup.getByRole('button', { name: 'Done', exact: true }).click()

    const search = page.getByRole('searchbox', { name: 'Student name or email', exact: true })
    await search.fill('  ADA  ')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(cards).toHaveCount(2)
    await expect(cards.locator('h3')).toHaveText(['Class A', 'Class C'])
    await checkRoster('Class A', ['Ada Student'])
    await checkRoster('Class C', ['Ada Student'])
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Select matching classes' }).check()
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible()

    const navigation = page.getByRole('navigation', { name: 'Classes sections' })
    await navigation.getByRole('button', { name: 'Enrollment approvals' }).click()
    await navigation.getByRole('button', { name: 'Your classes' }).click()
    await expect(search).toHaveValue('  ADA  ')
    await expect(cards).toHaveCount(2)
    await search.fill('BEN@EXAMPLE.TEST')
    await search.press('Enter')
    await expect(cards.locator('h3')).toHaveText(['Class A', 'Class B'])
    await checkRoster('Class A', ['Ben Student'])
    await checkRoster('Class B', ['Ben Student'])
    await search.fill('outside@example.test')
    await search.press('Enter')
    await expect(cards).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'No matching students' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear search', exact: true }).click()
    await expect(search).toHaveValue('')
    await expect(cards).toHaveCount(4)
    await checkRoster('Class A', ['Ada Student', 'Ben Student'])
    popup = await openClass('Class B')
    await expect(popup.getByRole('button', { name: 'Show students', exact: true })).toBeVisible()
    await expect(popup.getByRole('checkbox', { name: 'Select for deletion', exact: true })).not.toBeChecked()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await popup.getByRole('checkbox', { name: 'Select for deletion', exact: true }).check()
    await popup.getByRole('button', { name: 'Done', exact: true }).click()
    await search.fill('Ada')
    await search.press('Enter')
    await page.getByRole('checkbox', { name: 'Select matching classes' }).check()
    await page.getByRole('button', { name: 'Delete selected', exact: true }).click()
    await page.getByRole('dialog', { name: 'Delete 2 selected classes?', exact: true }).getByRole('button', { name: 'Delete selected', exact: true }).click()
    await expect.poll(() => deletedClassIds).toEqual(['a', 'c'])
  })
}
