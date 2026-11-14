import { expect, test } from '@playwright/test'

const attempts = [
  {
    id: 'one', classId: 'class-a', className: 'Class A', courseCode: 'ITN',
    assessment: 'one', studentName: 'Ada',
    passed: true, percentage: '80', status: 'submitted',
  },
  {
    id: 'two', classId: 'class-a', className: 'Class A', courseCode: 'ITN',
    assessment: 'two', studentName: 'Ben',
    passed: false, percentage: '40', status: 'submitted',
  },
  {
    id: 'three', classId: 'class-a', className: 'Class A', courseCode: 'ITN',
    assessment: 'two', studentName: 'Cam',
    passed: null, percentage: 99, status: 'in_progress',
  },
  {
    id: 'four', classId: 'class-b', className: 'Class B', courseCode: 'SRWE',
    assessment: 'three', studentName: 'Dee',
    passed: true, percentage: 100, status: 'submitted',
  },
  {
    id: 'five', classId: null, className: null, courseCode: 'ENSA',
    assessment: 'four', studentName: 'Eli',
    passed: false, percentage: 0, status: 'expired',
  },
].map((attempt) => ({
  ...attempt,
  attemptId: attempt.id,
  studentId: `student-${attempt.id}`,
  quizId: attempt.assessment,
  quizTitle: `Assessment ${attempt.assessment}`,
  labId: attempt.assessment,
  labTitle: `Assessment ${attempt.assessment}`,
  attemptNumber: 1,
  eventCount: 0,
  startedAt: '2026-11-12T00:00:00Z',
}))

for (const section of [
  { path: 'quizzes', panel: 'quizzes', assessmentLabel: 'Quiz' },
  { path: 'practicals', panel: 'practicals', assessmentLabel: 'CLI practical' },
]) {
  test(`${section.path} summary cards follow all result filters and reset safely`, async ({ page }) => {
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const data = {
        get_instructor_attempts: attempts,
        get_instructor_cli_results: attempts,
        get_instructor_question_analytics: { questions: [] },
        get_instructor_performance_trends: { trends: [], learningAreas: [] },
      }
      await route.fulfill({ json: data[name] ?? [] })
    })
    await page.goto(`/?uat-role=instructor#/instructor/results/${section.path}`)
    const panel = page.locator(`#results-subsection-${section.panel}`)
    const values = panel.locator('.results-metrics strong')
    const classFilter = panel.getByRole('combobox', { name: 'Class', exact: true })
    const courseFilter = panel.getByRole('combobox', { name: 'Course', exact: true })
    const assessmentFilter = panel.getByRole('combobox', { name: section.assessmentLabel, exact: true })
    const resultFilter = panel.getByRole('combobox', { name: 'Result', exact: true })
    const search = panel.getByRole('searchbox', { name: 'Search', exact: true })

    await expect(values).toHaveText(['5', '1', '50.0%', '55.0%'])
    await classFilter.selectOption('class-a')
    await expect(values).toHaveText(['3', '1', '50.0%', '60.0%'])
    await courseFilter.selectOption('ITN')
    await assessmentFilter.selectOption('two')
    await expect(values).toHaveText(['2', '1', '0.0%', '40.0%'])
    await resultFilter.selectOption('in_progress')
    await expect(values).toHaveText(['1', '1', '0.0%', '0.0%'])
    await resultFilter.selectOption('failed')
    await expect(values).toHaveText(['1', '0', '0.0%', '40.0%'])
    await search.fill('no matching student')
    await expect(values).toHaveText(['0', '0', '0.0%', '0.0%'])

    await search.clear()
    await resultFilter.selectOption('all')
    await assessmentFilter.selectOption('all')
    await courseFilter.selectOption('all')
    await classFilter.selectOption('all')
    await expect(values).toHaveText(['5', '1', '50.0%', '55.0%'])
    await courseFilter.selectOption('SRWE')
    await expect(values).toHaveText(['1', '0', '100.0%', '100.0%'])
    await courseFilter.selectOption('all')
    await classFilter.selectOption('unassigned')
    await expect(values).toHaveText(['1', '0', '0.0%', '0.0%'])
    await classFilter.selectOption('all')
    await search.fill('Ada')
    await expect(values).toHaveText(['1', '0', '100.0%', '80.0%'])
  })
}
