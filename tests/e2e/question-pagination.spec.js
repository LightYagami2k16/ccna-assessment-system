import { expect, test } from '@playwright/test'

for (const responseCap of [1000, 500]) {
  test(`question bank loads all 1550 rows with a ${responseCap}-row API cap`, async ({ page }) => {
    test.setTimeout(150_000)
    const course = { id: 1, code: 'ITN', title: 'Introduction to Networks' }
    const modules = [
      { id: 11, course_id: 1, code: 'ITN-1', title: 'First module', sort_order: 1 },
      { id: 12, course_id: 1, code: 'ITN-2', title: 'Later module', sort_order: 2 },
    ]
    const questions = Array.from({ length: 1550 }, (_, index) => ({
      id: String(1550 - index).padStart(4, '0'),
      course_id: 1,
      module_id: index < 1000 ? 11 : 12,
      title: `Question ${1550 - index}`,
      question_text: 'Sample question',
      question_type: 'multiple_choice',
      points: 1,
      status: index === 0 ? 'archived' : 'draft',
      created_at: '2026-11-12T00:00:00Z',
      courses: course,
      modules: modules[index < 1000 ? 0 : 1],
      question_options: [],
    }))
    const requests = []
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const endpoint = url.pathname.split('/').at(-1)
      if (endpoint === 'questions') {
        const eligible = url.searchParams.get('status') === 'neq.archived'
          ? questions.filter((question) => question.status !== 'archived')
          : questions
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? responseCap)
        requests.push({ offset, order: url.searchParams.get('order') })
        await route.fulfill({ json: eligible.slice(offset, offset + Math.min(limit, responseCap)) })
        return
      }
      const data = { courses: [course], modules }
      await route.fulfill({ json: data[endpoint] ?? [] })
    })
    await page.goto('/?uat-role=instructor#/instructor/question-bank')
    const library = page.locator('.question-list')
    await expect(library.locator('.section-heading .status-chip')).toHaveText('1550 questions')
    await library.getByRole('combobox', { name: 'Module', exact: true }).selectOption('12')
    await expect(library.locator('tbody tr')).toHaveCount(550)
    await expect(library.getByRole('checkbox', { name: 'Select Question 1', exact: true })).toBeAttached()
    expect(requests.length).toBeGreaterThan(1)
    expect(requests.every((request) => request.order === 'created_at.desc,id.desc')).toBe(true)

    const builder = await page.evaluate(async () => {
      const { getQuizBuilderQuestions } = await import('/src/services/quizBuilderService.js')
      const rows = await getQuizBuilderQuestions()
      return { count: rows.length, unique: new Set(rows.map((row) => row.id)).size, lastId: rows.at(-1)?.id }
    })
    expect(builder).toEqual({ count: 1549, unique: 1549, lastId: '0001' })
  })
}
