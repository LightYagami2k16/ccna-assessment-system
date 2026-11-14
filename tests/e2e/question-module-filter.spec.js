import { expect, test } from '@playwright/test'

const courses = [
  { id: 1, code: 'ITN', title: 'Introduction to Networks' },
  { id: 2, code: 'SRWE', title: 'Switching and Routing' },
]
const modules = [
  { id: 11, course_id: 1, code: 'Module 1', title: 'Network basics', sort_order: 1 },
  { id: 12, course_id: 1, code: 'Module 2', title: 'Switching basics', sort_order: 2 },
  { id: 21, course_id: 2, code: 'Module 1', title: 'Router basics', sort_order: 1 },
]
const questionRows = [
  { id: 'q1', course_id: 1, module_id: 11, title: 'ITN one', status: 'draft' },
  { id: 'q2', course_id: 1, module_id: 12, title: 'ITN two', status: 'draft' },
  { id: 'q3', course_id: 2, module_id: 21, title: 'SRWE one', status: 'draft' },
  { id: 'q4', course_id: 1, module_id: null, title: 'Unassigned question', status: 'draft' },
  { id: 'q5', course_id: 1, module_id: 11, title: 'ITN published', status: 'published' },
].map((question) => ({
  ...question,
  question_text: `Prompt for ${question.title}`,
  question_type: 'multiple_choice',
  points: 1,
  courses: courses.find((course) => course.id === question.course_id),
  modules: modules.find((module) => module.id === question.module_id) ?? null,
  question_options: [],
}))

async function mockQuestionBank(page) {
  let questions = [...questionRows]
  const mutations = []
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (['set_instructor_questions_status_bulk', 'delete_instructor_questions_bulk'].includes(endpoint)) {
      const payload = route.request().postDataJSON()
      mutations.push({ endpoint, payload })
      if (endpoint === 'delete_instructor_questions_bulk') {
        questions = questions.filter((question) => !payload.p_question_ids.includes(question.id))
      } else {
        questions = questions.map((question) => payload.p_question_ids.includes(question.id)
          ? { ...question, status: payload.p_status }
          : question)
      }
    }
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 1000)
    const data = { questions: questions.slice(offset, offset + limit), courses, modules }
    await route.fulfill({ json: data[endpoint] ?? [] })
  })
  return mutations
}

for (const role of ['instructor', 'administrator']) {
  test(`${role} can filter questions by module and publish only the visible selection`, async ({ page }) => {
    test.setTimeout(150_000)
    const mutations = await mockQuestionBank(page)
    await page.setViewportSize({ width: role === 'instructor' ? 390 : 1440, height: 1000 })
    const path = role === 'instructor' ? '/instructor/question-bank' : '/admin/assessment-tools/question-bank'
    await page.goto(`/?uat-role=${role}#${path}`)
    const library = page.locator('.question-list')
    const moduleFilter = library.getByRole('combobox', { name: 'Module', exact: true })
    await expect(moduleFilter).toBeVisible()
    await library.locator('.question-course-group').nth(1)
      .getByRole('button', { name: 'Show questions', exact: true }).click()
    await library.getByRole('checkbox', { name: 'Select SRWE one', exact: true }).check()

    await moduleFilter.selectOption('11')
    await expect(library.locator('.question-course-group')).toHaveCount(1)
    await expect(library.locator('tbody tr')).toHaveCount(2)
    await expect(library.getByRole('checkbox', { name: 'Select ITN one', exact: true })).toBeVisible()
    await expect(library.getByText('0 selected', { exact: true })).toBeVisible()
    await library.getByRole('checkbox', { name: 'Select all shown questions', exact: true }).check()
    await expect(library.getByRole('button', { name: 'Delete selected', exact: true })).toBeDisabled()
    await library.getByRole('button', { name: 'Publish selected', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Publish selected', exact: true }).click()
    await expect.poll(() => mutations).toContainEqual({
      endpoint: 'set_instructor_questions_status_bulk',
      payload: { p_question_ids: ['q1', 'q5'], p_status: 'published' },
    })
    await expect(moduleFilter).toHaveValue('11')
    await expect(library.locator('tbody tr')).toHaveCount(2)

    await moduleFilter.selectOption('21')
    await expect(library.locator('.question-course-group')).toHaveCount(1)
    await expect(library.getByRole('checkbox', { name: 'Select SRWE one', exact: true })).toBeVisible()
    await expect(library.getByRole('checkbox', { name: 'Select ITN one', exact: true })).toHaveCount(0)
    await moduleFilter.selectOption('unassigned')
    await expect(library.locator('tbody tr')).toHaveCount(1)
    await expect(library.getByRole('checkbox', { name: 'Select Unassigned question', exact: true })).toBeVisible()
    await library.getByRole('button', { name: 'Clear filter', exact: true }).click()
    await expect(moduleFilter).toHaveValue('all')
    await expect(library.locator('.question-course-group')).toHaveCount(2)
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1)
  })
}

test('module filters recover after deletion and show a clear empty state', async ({ page }) => {
  await mockQuestionBank(page)
  await page.goto('/?uat-role=instructor#/instructor/question-bank')
  const library = page.locator('.question-list')
  const moduleFilter = library.getByRole('combobox', { name: 'Module', exact: true })
  await moduleFilter.selectOption('12')
  await library.getByRole('checkbox', { name: 'Select all shown questions', exact: true }).check()
  await library.getByRole('button', { name: 'Delete selected', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete selected', exact: true }).click()
  await expect(moduleFilter).toHaveValue('all')
  await moduleFilter.selectOption('unassigned')
  await library.getByRole('checkbox', { name: 'Select all shown questions', exact: true }).check()
  await library.getByRole('button', { name: 'Delete selected', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete selected', exact: true }).click()
  await expect(library.getByRole('heading', { name: 'No questions in this module', exact: true })).toBeVisible()
  await library.getByRole('button', { name: 'Clear filter', exact: true }).click()
  await expect(moduleFilter).toHaveValue('all')
  await expect(library.locator('.question-course-group')).toHaveCount(2)
})
