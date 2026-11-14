import { expect, test } from '@playwright/test'

async function delayedWorkspace(page) {
  let paused = true
  let heldEndpoint = null
  const waiting = []
  const lab = { id: 'lab-one', title: 'Retained practical', courseId: 1, courseCode: 'ITN', status: 'draft',
    criteria: [], classIds: [], attemptCount: 0, durationMinutes: 30, deviceType: 'switch', initialHostname: 'Switch' }
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (paused && (!heldEndpoint || heldEndpoint === endpoint)) await new Promise((resolve) => waiting.push(resolve))
    const data = {
      get_instructor_cli_workspace: { labs: [lab], classes: [] },
      get_exam_controls_workspace: { students: [], quizzes: [], assignments: [], accommodations: [], activeAttempts: [] },
      courses: [{ id: 1, code: 'ITN', title: 'Introduction to Networks' }],
    }
    await route.fulfill({ json: data[endpoint] ?? [] })
  })
  return { pause(endpoint = null) { paused = true; heldEndpoint = endpoint }, release() { paused = false; waiting.splice(0).forEach((resolve) => resolve()) } }
}

test('Exam Controls keeps its initial loader inside Live Monitoring and navigation visible', async ({ page }) => {
  const requests = await delayedWorkspace(page)
  await page.goto('/?uat-role=instructor#/instructor/exam-controls/monitoring')
  await expect(page.getByRole('navigation', { name: 'Exam controls sections' })).toBeVisible({ timeout: 45000 })
  const panel = page.locator('#exam-controls-subsection-monitoring')
  await expect(panel.getByRole('heading', { name: 'Active attempts', exact: true })).toBeVisible()
  await expect(panel.getByText(/Loading .*attempts/)).toBeVisible()
  await expect(page.locator('.exam-controls > .loading-state')).toHaveCount(0)
  await expect(panel.getByText('No active attempts', { exact: true })).toHaveCount(0)
  requests.release()
  await expect(panel.getByText('No active attempts', { exact: true })).toBeVisible()
  requests.pause()
  await panel.getByRole('button', { name: 'Refresh now', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Refreshing...', exact: true })).toBeDisabled()
  await expect(panel.getByText('No active attempts', { exact: true })).toBeVisible()
  await expect(panel.locator('.loading-state')).toHaveCount(0)
  requests.release()
  await expect(panel.getByRole('button', { name: 'Refresh now', exact: true })).toBeEnabled()
})

test('practical library count is unknown initially and detail popup survives delayed refresh', async ({ page }) => {
  const requests = await delayedWorkspace(page)
  await page.goto('/?uat-role=instructor#/instructor/practicals')
  const library = page.locator('#cli-practicals-subsection-library')
  await expect(library.getByRole('heading', { name: 'Practical library', exact: true })).toBeVisible({ timeout: 45000 })
  await expect(library.getByText('0 practicals', { exact: true })).toHaveCount(0)
  await expect(library.getByText('Loading CLI practicals...', { exact: true })).toBeVisible()
  requests.release()
  await library.getByRole('button', { name: 'Show practicals', exact: true }).click()
  await library.getByRole('button', { name: 'Show details', exact: true }).click()
  const popup = page.getByRole('dialog', { name: 'Retained practical', exact: true })
  requests.pause('get_instructor_cli_workspace')
  await popup.getByRole('button', { name: 'Duplicate draft', exact: true }).click()
  await page.getByRole('dialog', { name: 'Duplicate CLI practical?', exact: true }).getByRole('button', { name: 'Duplicate practical', exact: true }).click()
  await expect(library.getByRole('button', { name: 'Duplicating...', exact: true })).toBeDisabled()
  await expect(popup).toBeVisible()
  await expect(popup.getByRole('heading', { name: 'Retained practical', exact: true })).toBeVisible()
  await expect(library.locator('.loading-state')).toHaveCount(0)
  requests.release()
  await expect(library.getByRole('button', { name: 'Duplicate draft', exact: true })).toBeEnabled()
  await expect(popup).toBeVisible()
})

for (const screen of [
  { path: 'quizzes', panel: '#quizzes-subsection-library', heading: 'Quiz library', label: 'Loading quizzes...', refresh: null },
  { path: 'question-bank', panel: '#questions-subsection-library', heading: 'Question bank', label: 'Loading question bank...', refresh: null },
  { path: 'question-bank/modules', panel: '#questions-subsection-modules', heading: 'Course modules', label: 'Loading course modules...', refresh: null },
  { path: 'classes', panel: '#assignments-subsection-classes', heading: 'Your classes', label: 'Loading classes and assignments...', refresh: 'Refresh classes' },
  { path: 'results/quizzes', panel: '#results-subsection-quizzes', heading: 'Student Quiz attempts', label: 'Loading student results...', refresh: 'Refresh results' },
  { path: 'results/practicals', panel: '#results-subsection-practicals', heading: 'Student CLI attempts', label: 'Loading CLI results...', refresh: 'Refresh CLI results' },
  { path: 'results', panel: '#results-subsection-overall', heading: 'Overall results', label: 'Loading overall results...', refresh: 'Refresh overview' },
  { path: 'results/question-analytics', panel: '#results-subsection-analytics', heading: 'Question performance', label: 'Loading question analytics...', refresh: 'Refresh analytics' },
  { path: 'results/performance-trends', panel: '#results-subsection-trends', heading: 'Progress and learning areas', label: 'Loading performance trends...', refresh: 'Refresh trends' },
]) {
  test(`${screen.path} contains its initial loading and retains its view on refresh`, async ({ page }) => {
    const requests = await delayedWorkspace(page)
    await page.goto(`/?uat-role=instructor#/instructor/${screen.path}`)
    const panel = page.locator(screen.panel)
    await expect(panel).toBeVisible({ timeout: 45000 })
    await expect(panel.getByRole('heading', { name: screen.heading, exact: true })).toBeVisible()
    const initialHeadingY = (await panel.getByRole('heading', { name: screen.heading, exact: true }).boundingBox()).y
    await expect(panel.getByText(screen.label, { exact: true })).toBeVisible()
    await expect(panel.locator('.empty-state')).toHaveCount(0)
    requests.release()
    if (screen.refresh) await expect(panel.getByRole('button', { name: screen.refresh, exact: true })).toBeEnabled()
    await expect(panel.locator('.loading-state')).toHaveCount(0)
    expect(Math.abs((await panel.getByRole('heading', { name: screen.heading, exact: true }).boundingBox()).y - initialHeadingY)).toBeLessThanOrEqual(1)
    if (!screen.refresh) {
      await expect(panel.getByRole('button', { name: /^Refresh/ })).toHaveCount(0)
      return
    }
    requests.pause()
    await panel.getByRole('button', { name: screen.refresh, exact: true }).click()
    await expect(panel.getByRole('button', { name: 'Refreshing...', exact: true })).toBeDisabled()
    await expect(panel.locator('.loading-state')).toHaveCount(0)
    await expect(panel.getByRole('heading', { name: screen.heading, exact: true })).toBeVisible()
    requests.release()
    await expect(panel.getByRole('button', { name: screen.refresh, exact: true })).toBeEnabled()
  })
}

test('class draft survives refresh but a successful creation resets its completed form', async ({ page }) => {
  const requests = await delayedWorkspace(page)
  await page.goto('/?uat-role=instructor#/instructor/classes')
  requests.release()
  const editor = page.locator('.class-editor')
  await editor.getByRole('button', { name: 'Create class', exact: true }).click()
  await editor.getByLabel('Class name', { exact: true }).fill('Saved class')
  await editor.getByLabel('Class identifier', { exact: true }).fill('ITN-A')
  await page.getByRole('button', { name: 'Refresh classes', exact: true }).first().click()
  await expect(editor.getByLabel('Class name', { exact: true })).toHaveValue('Saved class')
  await editor.getByRole('button', { name: 'Create class', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Create class', exact: true })).toBeVisible()
  await expect(editor.getByLabel('Class name', { exact: true })).toBeHidden()
  await editor.getByRole('button', { name: 'Create class', exact: true }).click()
  await expect(editor.getByLabel('Class name', { exact: true })).toHaveValue('')
})
