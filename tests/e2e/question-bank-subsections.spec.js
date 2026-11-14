import { expect, test } from '@playwright/test'

const course = { id: 1, code: 'ITN', title: 'Introduction to Networks' }
const modules = [
  { id: 11, course_id: 1, code: 'ITN-1', title: 'Network basics', sort_order: 1 },
  { id: 12, course_id: 1, code: 'ITN-2', title: 'Switch basics', sort_order: 2 },
]

async function mockQuestionBank(page) {
  let questions = modules.map((module, index) => ({
    id: `q${index + 1}`,
    course_id: 1,
    module_id: module.id,
    title: index ? 'Another question' : 'Editable question',
    question_text: 'Sample question prompt',
    question_type: 'multiple_choice',
    difficulty: 'beginner',
    points: 1,
    status: 'draft',
    created_at: '2026-11-12T00:00:00Z',
    courses: course,
    modules: module,
    question_options: ['A', 'B', 'C', 'D'].map((text, optionIndex) => ({
      id: `${index}-${optionIndex}`,
      option_text: text,
      is_correct: optionIndex === 0,
      sort_order: optionIndex,
    })),
  }))
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'questions' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON()
      const id = 'created-question'
      questions.push({ ...payload, id, courses: course,
        modules: modules.find((module) => String(module.id) === String(payload.module_id)),
        created_at: '2026-11-12T01:00:00Z', question_options: [] })
      await route.fulfill({ json: { id } })
      return
    }
    if (endpoint === 'question_options' && route.request().method() === 'POST') {
      const options = route.request().postDataJSON()
      questions = questions.map((question) => question.id === options[0]?.question_id
        ? { ...question, question_options: options } : question)
    }
    if (endpoint === 'update_instructor_question') {
      const { p_payload: payload } = route.request().postDataJSON()
      questions = questions.map((question) => question.id === payload.id
        ? { ...question, title: payload.title, question_text: payload.questionText }
        : question)
    }
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 1000)
    const data = { courses: [course], modules, questions: questions.slice(offset, offset + limit) }
    await route.fulfill({ json: data[endpoint] ?? [] })
  })
}

for (const role of ['instructor', 'administrator']) {
  test(`${role} question-bank subsections preserve drafts, filters, imports, and history`, async ({ page }) => {
    test.setTimeout(180_000)
    await mockQuestionBank(page)
    await page.setViewportSize({ width: role === 'instructor' ? 390 : 1440, height: 1000 })
    const base = role === 'instructor' ? '/instructor/question-bank' : '/admin/assessment-tools/question-bank'
    await page.goto(`/?uat-role=${role}#${base}`)
    const navigation = page.getByRole('navigation', { name: 'Question bank sections' })
    await expect(navigation.getByRole('button')).toHaveCount(4)
    const library = page.locator('.question-list')
    const editor = page.locator('.question-editor')
    await expect(library).toBeVisible()
    await expect(page.locator('.module-manager')).toBeHidden()
    await library.getByRole('combobox', { name: 'Module', exact: true }).selectOption('11')

    await navigation.getByRole('button', { name: 'Create / edit question', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`#${base}/editor$`))
    await editor.getByLabel('Internal title', { exact: true }).fill('Unsaved title')
    await editor.getByRole('textbox', { name: 'Question', exact: true }).fill('Unsaved prompt')
    await navigation.getByRole('button', { name: 'Course modules', exact: true }).click()
    await expect(page.locator('.module-manager')).toBeVisible()
    await expect(editor).toBeHidden()
    await navigation.getByRole('button', { name: 'Create / edit question', exact: true }).click()
    await expect(editor.getByLabel('Internal title', { exact: true })).toHaveValue('Unsaved title')
    await expect(editor.getByRole('textbox', { name: 'Question', exact: true })).toHaveValue('Unsaved prompt')

    await navigation.getByRole('button', { name: 'Import / export', exact: true }).click()
    await page.getByLabel('Question-bank JSON file', { exact: true })
      .setInputFiles('public/templates/ccna-question-bank-import-template.json')
    await expect(page.getByText('ccna-question-bank-import-template.json', { exact: true })).toBeVisible()
    await navigation.getByRole('button', { name: 'Course modules', exact: true }).click()
    await navigation.getByRole('button', { name: 'Import / export', exact: true }).click()
    await expect(page.getByText('ccna-question-bank-import-template.json', { exact: true })).toBeVisible()

    await navigation.getByRole('button', { name: 'Question library', exact: true }).click()
    await expect(library.getByRole('combobox', { name: 'Module', exact: true })).toHaveValue('11')
    const row = library.locator('tbody tr').filter({ hasText: 'Editable question' })
    await row.getByRole('combobox', { name: 'Action for Editable question', exact: true }).selectOption('edit')
    await row.getByRole('button', { name: 'OK', exact: true }).click()
    await expect(editor.getByRole('heading', { name: 'Edit draft question', exact: true })).toBeVisible()
    await editor.getByLabel('Internal title', { exact: true }).fill('Editing draft')
    await page.goBack()
    await expect(library).toBeVisible()
    await page.goForward()
    await expect(editor.getByLabel('Internal title', { exact: true })).toHaveValue('Editing draft')
    await editor.getByRole('button', { name: 'Cancel editing', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`#${base}$`))
    await expect(library).toBeVisible()

    for (const section of [
      { label: 'Course modules', suffix: 'modules' },
      { label: 'Import / export', suffix: 'import-export' },
    ]) {
      await navigation.getByRole('button', { name: section.label, exact: true }).click()
      await page.reload()
      await expect(navigation.getByRole('button', { name: section.label, exact: true }))
        .toHaveAttribute('aria-current', 'page')
      await expect(page).toHaveURL(new RegExp(`#${base}/${section.suffix}$`))
    }
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1)
  })
}

test('saving an edited question returns to the filtered library', async ({ page }) => {
  await mockQuestionBank(page)
  await page.goto('/?uat-role=instructor#/instructor/question-bank')
  const library = page.locator('.question-list')
  await library.getByRole('combobox', { name: 'Module', exact: true }).selectOption('11')
  const row = library.locator('tbody tr').filter({ hasText: 'Editable question' })
  await row.getByRole('combobox', { name: 'Action for Editable question', exact: true }).selectOption('edit')
  await row.getByRole('button', { name: 'OK', exact: true }).click()
  const editor = page.locator('.question-editor')
  await editor.getByLabel('Internal title', { exact: true }).fill('Saved title')
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(/#\/instructor\/question-bank$/)
  await expect(library.getByRole('combobox', { name: 'Module', exact: true })).toHaveValue('11')
  await expect(library.getByRole('checkbox', { name: 'Select Saved title', exact: true })).toBeVisible()
})

test('creating a question returns to the filtered library and resets the completed form', async ({ page }) => {
  await mockQuestionBank(page)
  await page.goto('/?uat-role=instructor#/instructor/question-bank')
  const navigation = page.getByRole('navigation', { name: 'Question bank sections' })
  const library = page.locator('.question-list')
  await library.getByRole('combobox', { name: 'Module', exact: true }).selectOption('11')
  await navigation.getByRole('button', { name: 'Create / edit question', exact: true }).click()
  const editor = page.locator('.question-editor')
  await editor.getByRole('combobox', { name: 'Course', exact: true }).selectOption('1')
  await editor.getByRole('combobox', { name: 'Module', exact: true }).selectOption('11')
  await editor.getByLabel('Internal title', { exact: true }).fill('New question')
  await editor.getByRole('textbox', { name: 'Question', exact: true }).fill('New prompt')
  for (let index = 1; index <= 4; index += 1) {
    await editor.getByPlaceholder(`Option ${index}`, { exact: true }).fill(`Answer ${index}`)
  }
  await editor.getByRole('button', { name: 'Create question', exact: true }).click()
  await expect(page).toHaveURL(/#\/instructor\/question-bank$/)
  await expect(library.getByRole('combobox', { name: 'Module', exact: true })).toHaveValue('11')
  await expect(library.getByRole('checkbox', { name: 'Select New question', exact: true })).toBeVisible()
  await navigation.getByRole('button', { name: 'Create / edit question', exact: true }).click()
  await expect(editor.getByLabel('Internal title', { exact: true })).toHaveValue('')
  await expect(editor.getByRole('textbox', { name: 'Question', exact: true })).toHaveValue('')
  await expect(editor.getByRole('combobox', { name: 'Course', exact: true })).toHaveValue('')
})
