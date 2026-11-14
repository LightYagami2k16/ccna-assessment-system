import { expect, test } from '@playwright/test'

async function mockWorkspace(page, shouldFail = () => false) {
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (shouldFail(endpoint)) return route.fulfill({ status: 500, json: { message: 'Temporary load failure' } })
    const objects = {
      get_instructor_cli_workspace: { labs: [], classes: [] },
      get_exam_controls_workspace: { students: [], quizzes: [], assignments: [], accommodations: [], activeAttempts: [] },
      get_student_active_assessment_session: null,
    }
    await route.fulfill({ json: Object.hasOwn(objects, endpoint) ? objects[endpoint] : [] })
  })
}

test('content and configuration sections omit routine refresh controls', async ({ page }) => {
  test.setTimeout(180000)
  await mockWorkspace(page)
  for (const [path, selector] of [
    ['quizzes/templates', '#quizzes-subsection-templates'],
    ['quizzes', '#quizzes-subsection-library'],
    ['practicals/templates', '#cli-practicals-subsection-templates'],
    ['practicals', '#cli-practicals-subsection-library'],
    ['question-bank', '#questions-subsection-library'],
    ['question-bank/modules', '#questions-subsection-modules'],
    ['classes/access', '#assignments-subsection-access'],
    ['exam-controls', '#exam-controls-subsection-schedules'],
    ['exam-controls/integrity', '#exam-controls-subsection-integrity'],
    ['exam-controls/accommodations', '#exam-controls-subsection-accommodations'],
  ]) {
    await page.goto(`/?uat-role=instructor#/instructor/${path}`)
    const panel = page.locator(selector)
    await expect(panel).toBeVisible({ timeout: 45000 })
    await expect(panel.locator('.loading-state')).toHaveCount(0)
    await expect(panel.getByRole('button', { name: /^Refresh/ })).toHaveCount(0)
    await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
  }
})

test('a failed library load offers Retry only until recovery', async ({ page }) => {
  let failed = true
  await mockWorkspace(page, (endpoint) => failed && endpoint === 'quizzes')
  await page.goto('/?uat-role=instructor#/instructor/quizzes')
  const panel = page.locator('#quizzes-subsection-library')
  await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: /^Refresh/ })).toHaveCount(0)
  failed = false
  await panel.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(panel.getByRole('heading', { name: 'No quizzes created yet', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
})

test('student history has no routine refresh and offers contextual retry after failure', async ({ page }) => {
  let failed = true
  await mockWorkspace(page, (endpoint) => failed && endpoint === 'get_student_recent_quiz_results')
  await page.goto('/?uat-role=student#/student/history')
  const history = page.locator('.student-assessment-history')
  await expect(history.getByRole('button', { name: /^Refresh/ })).toHaveCount(0)
  await expect(history.getByRole('button', { name: 'Refresh results', exact: true })).toHaveCount(0)
  const quizzes = history.locator('.student-recent-results:not(.student-cli-history)')
  await expect(quizzes.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  failed = false
  await quizzes.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(quizzes.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
  await expect(history.getByRole('button', { name: /^Refresh/ })).toHaveCount(0)
})

test('failed automatic question reload retains the table and retries without losing its filter', async ({ page }) => {
  let failReads = false
  let holdRetry = false
  const pending = []
  const question = { id: 'q-one', course_id: 1, module_id: null, title: 'Retained question',
    question_text: 'Sample prompt', question_type: 'multiple_choice', difficulty: 'beginner', points: 1,
    status: 'draft', courses: { id: 1, code: 'ITN', title: 'Introduction to Networks' }, modules: null, question_options: [] }
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'set_instructor_question_status') {
      question.status = 'published'
      failReads = true
      return route.fulfill({ json: true })
    }
    if (endpoint === 'questions') {
      if (failReads) return route.fulfill({ status: 500, json: { message: 'Temporary reload failure' } })
      if (holdRetry) await new Promise((resolve) => pending.push(resolve))
      return route.fulfill({ json: Number(url.searchParams.get('offset') || 0) ? [] : [question] })
    }
    return route.fulfill({ json: endpoint === 'courses' ? [question.courses] : [] })
  })
  await page.goto('/?uat-role=instructor#/instructor/question-bank')
  const panel = page.locator('.question-list')
  await panel.getByRole('combobox', { name: 'Module', exact: true }).selectOption('unassigned')
  const row = panel.locator('tbody tr').filter({ hasText: 'Retained question' })
  await row.getByRole('combobox', { name: 'Action for Retained question', exact: true }).selectOption('status')
  await row.getByRole('button', { name: 'OK', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await expect(row).toBeVisible()
  failReads = false
  holdRetry = true
  await panel.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Refreshing...', exact: true })).toBeDisabled()
  await expect(row).toBeVisible()
  await expect(panel.locator('.loading-state')).toHaveCount(0)
  holdRetry = false
  pending.splice(0).forEach((resolve) => resolve())
  await expect(panel.getByRole('button', { name: 'Refreshing...', exact: true })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
  await expect(panel.getByRole('combobox', { name: 'Module', exact: true })).toHaveValue('unassigned')
  await expect(row).toBeVisible()
})
