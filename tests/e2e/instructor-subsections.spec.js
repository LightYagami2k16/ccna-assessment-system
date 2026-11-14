import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    const responses = {
      get_assignment_workspace: {
        students: [],
        classes: [],
        approvalRequests: [],
        quizzes: [],
      },
      get_exam_controls_workspace: {},
      get_instructor_question_analytics: { questions: [] },
      get_instructor_performance_trends: { trends: [], learningAreas: [] },
    }
    await route.fulfill({ json: responses[endpoint] ?? [] })
  })
})

test('class subsections preserve a draft and support refresh and browser history', async ({ page }) => {
  await page.goto('/?uat-role=instructor#/instructor/classes')
  const navigation = page.getByRole('navigation', { name: 'Classes sections' })
  await expect(navigation).toBeVisible()
  await page.getByRole('button', { name: 'Create class', exact: true }).click()
  await page.getByLabel('Class name', { exact: true }).fill('Unsaved class')
  await navigation.getByRole('button', { name: 'Enrollment approvals' }).click()
  await expect(page).toHaveURL(/#\/instructor\/classes\/enrollment$/)
  await expect(page.getByRole('heading', { name: 'Pending class requests' })).toBeVisible()
  await expect(page.getByLabel('Class name', { exact: true })).toBeHidden()
  await navigation.getByRole('button', { name: 'Your classes' }).click()
  await expect(page.getByLabel('Class name', { exact: true })).toHaveValue('Unsaved class')
  await navigation.getByRole('button', { name: 'Quiz and practical access' }).click()
  await expect(page.getByRole('heading', { name: 'Assign quizzes' })).toBeVisible()
  await page.reload()
  await expect(navigation.getByRole('button', { name: 'Quiz and practical access' }))
    .toHaveAttribute('aria-current', 'page')
  await page.goBack()
  await expect(navigation.getByRole('button', { name: 'Your classes' }))
    .toHaveAttribute('aria-current', 'page')
  await page.goForward()
  await expect(navigation.getByRole('button', { name: 'Quiz and practical access' }))
    .toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: 'Manage practical access' }).click()
  await expect(page).toHaveURL(/#\/instructor\/practicals$/)
})

test('exam subsections retain accommodation edits and separate policy and monitoring controls', async ({ page }) => {
  await page.goto('/?uat-role=instructor#/instructor/exam-controls')
  const navigation = page.getByRole('navigation', { name: 'Exam controls sections' })
  await navigation.getByRole('button', { name: 'Student accommodations' }).click()
  await page.getByLabel('Extra time (minutes)', { exact: true }).fill('25')
  await navigation.getByRole('button', { name: 'Integrity enforcement' }).click()
  await expect(page.getByRole('heading', { name: 'Assessment policies' })).toBeVisible()
  await expect(page.getByLabel('Extra time (minutes)', { exact: true })).toBeHidden()
  await navigation.getByRole('button', { name: 'Live monitoring' }).click()
  await expect(page.getByRole('heading', { name: 'Active attempts', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Assessment policies' })).toBeHidden()
  await navigation.getByRole('button', { name: 'Student accommodations' }).click()
  await expect(page.getByLabel('Extra time (minutes)', { exact: true })).toHaveValue('25')
})

test('results have five focused sections and retain quiz filters', async ({ page }) => {
  await page.goto('/?uat-role=instructor#/instructor/results')
  const navigation = page.getByRole('navigation', { name: 'Results sections' })
  await expect(navigation.getByRole('button')).toHaveCount(5)
  await expect(page.getByRole('heading', { name: 'Overall results', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Student Quiz attempts' })).toBeHidden()
  await navigation.getByRole('button', { name: 'Quiz results', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('Unsaved filter')
  await navigation.getByRole('button', { name: 'CLI practical results', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Student CLI attempts' })).toBeVisible()
  await navigation.getByRole('button', { name: 'Quiz results', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toHaveValue('Unsaved filter')
  await navigation.getByRole('button', { name: 'Question analytics', exact: true }).click()
  await expect(page).toHaveURL(/#\/instructor\/results\/question-analytics$/)
  await expect(page.locator('.workspace-subsection-panel:not([hidden])')).toHaveCount(1)
  await navigation.getByRole('button', { name: 'Performance trends', exact: true }).click()
  await expect(page).toHaveURL(/#\/instructor\/results\/performance-trends$/)
  await page.reload()
  await expect(navigation.getByRole('button', { name: 'Performance trends', exact: true }))
    .toHaveAttribute('aria-current', 'page')
})

test('CLI policy edits survive monitoring refresh and save through the existing service', async ({ page }) => {
  await page.clock.install()
  const policy = {
    assessmentType: 'cli',
    assessmentId: 'sample-cli-lab',
    courseCode: 'ITN',
    title: 'Router configuration',
    behavior: 'warn',
    incidentLimit: 3,
    maxHiddenSeconds: 60,
  }
  let savedPayload = null
  await page.route('**/rpc/get_instructor_integrity_policies', (route) =>
    route.fulfill({ json: [policy] }))
  await page.route('**/rpc/save_assessment_integrity_policy', async (route) => {
    savedPayload = route.request().postDataJSON().p_payload
    Object.assign(policy, savedPayload)
    await route.fulfill({ json: policy })
  })
  await page.goto('/?uat-role=instructor#/instructor/exam-controls/integrity')
  const navigation = page.getByRole('navigation', { name: 'Exam controls sections' })
  await expect(page.getByRole('combobox', { name: 'Assessment', exact: true }))
    .toHaveValue('cli:sample-cli-lab')
  await page.getByLabel('Incident limit', { exact: true }).fill('7')
  await navigation.getByRole('button', { name: 'Live monitoring' }).click()
  const refresh = page.waitForResponse('**/rpc/get_instructor_integrity_policies')
  await page.clock.fastForward(10000)
  await refresh
  await navigation.getByRole('button', { name: 'Integrity enforcement' }).click()
  await expect(page.getByLabel('Incident limit', { exact: true })).toHaveValue('7')
  await page.getByRole('button', { name: 'Save integrity policy', exact: true }).click()
  await expect.poll(() => savedPayload).toEqual({
    assessmentType: 'cli',
    assessmentId: 'sample-cli-lab',
    behavior: 'warn',
    incidentLimit: 7,
    maxHiddenSeconds: 60,
  })
})

test('administrator subsection navigation stays in administrator assessment tools', async ({ page }) => {
  for (const section of [
    { page: 'classes', label: 'Classes sections', button: 'Enrollment approvals', suffix: 'enrollment' },
    { page: 'exam-controls', label: 'Exam controls sections', button: 'Live monitoring', suffix: 'monitoring' },
    { page: 'results', label: 'Results sections', button: 'Question analytics', suffix: 'question-analytics' },
  ]) {
    await page.goto(`/?uat-role=administrator#/admin/assessment-tools/${section.page}`)
    await page.getByRole('navigation', { name: section.label })
      .getByRole('button', { name: section.button, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`#/admin/assessment-tools/${section.page}/${section.suffix}$`))
    await page.reload()
    await expect(page.getByRole('navigation', { name: section.label })
      .getByRole('button', { name: section.button, exact: true }))
      .toHaveAttribute('aria-current', 'page')
  }
})

test('subsection navigation fits a compact phone and supports the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  for (const section of [
    { page: 'classes', label: 'Classes sections' },
    { page: 'exam-controls', label: 'Exam controls sections' },
    { page: 'results', label: 'Results sections' },
  ]) {
    await page.goto(`/?uat-role=instructor#/instructor/${section.page}`)
    const navigation = page.getByRole('navigation', { name: section.label })
    const buttons = navigation.getByRole('button')
    await buttons.first().focus()
    await page.keyboard.press('Tab')
    await expect(buttons.nth(1)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(buttons.nth(1)).toHaveAttribute('aria-current', 'page')
    for (const button of await buttons.all()) {
      await button.click()
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
    }
  }
})
