import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'compact phone', width: 320, height: 720 },
  { name: 'phone', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

const instructorTools = [
  'Question bank',
  'Quizzes',
  'CLI practicals',
  'Classes & assignments',
  'Exam controls',
  'Student results',
]

const studentPages = [
  { path: '/student/overview', heading: 'Student overview' },
  { path: '/student/assessments', heading: 'Available quizzes' },
  { path: '/student/practicals', heading: 'Available CLI practicals' },
  { path: '/student/history', heading: 'Assessment history' },
  {
    path: '/student/classes',
    heading: /My class enrollment|Join your class/,
  },
  { path: '/student/guide', heading: 'How to take an exam' },
]

for (const viewport of viewports) {
  test(`instructor workspace fits a ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/?uat-role=instructor')
    await expect(
      page.getByRole('heading', { name: 'Welcome back, UAT Instructor' }),
    ).toBeVisible()
    await expect(page.locator('.workspace-page-header h1')).toHaveText(
      'Overview',
    )
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await expect(page.getByRole('button', { name: 'Account settings' })).toBeVisible()

    for (const tool of instructorTools) {
      const mobileMenuButton = page.getByRole('button', { name: 'Open menu' })

      if (await mobileMenuButton.isVisible()) {
        await mobileMenuButton.click()
      }

      await page.getByRole('button', { name: new RegExp(`^${tool}`) }).click()
      await expect(page.locator('.workspace-page-header h1')).toHaveText(tool)

      const toolOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )

      expect(toolOverflow, `${tool} must fit the ${viewport.name} viewport`)
        .toBeLessThanOrEqual(1)
    }
  })
}

test('shared actions remain reachable with long labels at compact width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/?uat-role=instructor')

  const menuButton = page.getByRole('button', { name: 'Open menu' })
  if (await menuButton.isVisible()) await menuButton.click()

  const questionBankButton = page.getByRole('button', {
    name: /^Question bank/,
  })
  await questionBankButton.focus()

  const focusStyle = await questionBankButton.evaluate((element) => {
    const style = window.getComputedStyle(element)
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    }
  })

  expect(focusStyle.outlineStyle).not.toBe('none')
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0)

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test('quiz and CLI history values stay inside compact result cards', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/?uat-role=student')
  await expect(
    page.getByRole('heading', { name: 'Student overview' }),
  ).toBeVisible()

  await page.evaluate(() => {
    const fixture = document.createElement('div')
    fixture.id = 'compact-history-fixture'
    fixture.style.width = '260px'
    fixture.innerHTML = `
      <div class="recent-attempt-table-wrapper">
        <table class="recent-attempt-table recent-attempt-table--cli">
          <thead><tr><th>Attempt</th><th>Score</th><th>Result</th><th>Commands</th><th>Completed</th></tr></thead>
          <tbody><tr>
            <td data-label="Attempt"><div class="recent-attempt-number"><strong>Attempt #2</strong><span>Latest</span></div></td>
            <td data-label="Score"><div class="recent-attempt-score"><strong>0.00%</strong><small>0 of 95 points</small></div></td>
            <td data-label="Result"><span class="quiz-result__status quiz-result__status--failed">Not passed</span></td>
            <td data-label="Commands"><strong>2</strong></td>
            <td data-label="Completed"><time>Aug 10, 2026, 3:32 PM</time></td>
          </tr></tbody>
        </table>
      </div>`
    document.querySelector('#main-workspace-content').append(fixture)
  })

  const dimensions = await page.locator('#compact-history-fixture').evaluate((fixture) => {
    const wrapper = fixture.querySelector('.recent-attempt-table-wrapper')
    const cells = [...fixture.querySelectorAll('td')]
    const wrapperBox = wrapper.getBoundingClientRect()
    return {
      scrollWidth: wrapper.scrollWidth,
      clientWidth: wrapper.clientWidth,
      cellsInside: cells.every((cell) => {
        const box = cell.getBoundingClientRect()
        return box.left >= wrapperBox.left - 1 && box.right <= wrapperBox.right + 1
      }),
    }
  })

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
  expect(dimensions.cellsInside).toBe(true)
})

test('question analytics course cards stack cleanly at compact width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/?uat-role=instructor')
  await expect(
    page.getByRole('heading', { name: 'Welcome back, UAT Instructor' }),
  ).toBeVisible()

  await page.evaluate(() => {
    const fixture = document.createElement('section')
    fixture.id = 'compact-question-analytics-fixture'
    fixture.style.width = '280px'
    fixture.innerHTML = `
      <section class="question-analytics-course-group">
        <button class="question-analytics-course-group__toggle" type="button">
          <span class="question-analytics-course-group__identity">
            <span class="course-code">ITN</span>
            <span><strong>4 questions</strong><small>Question performance and response details</small></span>
          </span>
          <span class="question-analytics-course-group__summary">
            <span><small>Average accuracy</small><strong>29.2%</strong></span>
            <span><small>Need review</small><strong>3</strong></span>
          </span>
          <span class="question-analytics-course-group__action">Show questions</span>
        </button>
      </section>`
    document.querySelector('#main-workspace-content').append(fixture)
  })

  const layout = await page
    .locator('#compact-question-analytics-fixture')
    .evaluate((fixture) => {
      const toggle = fixture.querySelector('.question-analytics-course-group__toggle')
      const identity = fixture.querySelector('.question-analytics-course-group__identity')
      const summary = fixture.querySelector('.question-analytics-course-group__summary')
      const action = fixture.querySelector('.question-analytics-course-group__action')
      const toggleBox = toggle.getBoundingClientRect()
      const identityBox = identity.getBoundingClientRect()
      const summaryBox = summary.getBoundingClientRect()
      const actionBox = action.getBoundingClientRect()

      return {
        contained:
          identityBox.left >= toggleBox.left &&
          summaryBox.left >= toggleBox.left &&
          actionBox.left >= toggleBox.left &&
          identityBox.right <= toggleBox.right &&
          summaryBox.right <= toggleBox.right &&
          actionBox.right <= toggleBox.right,
        stacked:
          identityBox.bottom <= summaryBox.top &&
          summaryBox.bottom <= actionBox.top,
      }
    })

  expect(layout.contained).toBe(true)
  expect(layout.stacked).toBe(true)
})

test('result-card collapse controls keep normal height at compact width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/?uat-role=instructor')
  await expect(
    page.getByRole('heading', { name: 'Welcome back, UAT Instructor' }),
  ).toBeVisible()

  await page.evaluate(() => {
    const fixture = document.createElement('div')
    fixture.id = 'compact-result-controls-fixture'
    fixture.style.width = '300px'
    fixture.innerHTML = `
      <section class="class-result-group">
        <header class="class-result-group__header">
          <label class="bulk-select-control">
            <input type="checkbox">
            <span><span class="eyebrow">SRWE</span><strong>CCNA 2</strong><small>No academic term</small></span>
          </label>
          <div class="result-group__controls">
            <span class="status-chip">1 student</span>
            <button class="result-collapse-button" type="button">Hide students</button>
          </div>
        </header>
        <div class="class-result-group__students">
          <article class="student-result-group">
            <header class="student-result-group__header">
              <label class="bulk-select-control student-result-group__identity">
                <input type="checkbox"><span class="student-result-group__avatar">S</span>
                <span><strong>Student2</strong><small>student@example.com</small></span>
              </label>
              <div class="result-group__controls">
                <span class="student-result-group__count">2 attempts</span>
                <button class="module-collapse-button" type="button">Show records</button>
              </div>
            </header>
          </article>
        </div>
      </section>`
    document.querySelector('#main-workspace-content').append(fixture)
  })

  const layout = await page
    .locator('#compact-result-controls-fixture')
    .evaluate((fixture) => {
      const fixtureBox = fixture.getBoundingClientRect()
      const buttons = [...fixture.querySelectorAll('.result-group__controls button')]
      return {
        normalHeight: buttons.every((button) => button.getBoundingClientRect().height <= 56),
        contained: buttons.every((button) => {
          const box = button.getBoundingClientRect()
          return box.left >= fixtureBox.left - 1 && box.right <= fixtureBox.right + 1
        }),
      }
    })

  expect(layout.normalHeight).toBe(true)
  expect(layout.contained).toBe(true)
})

for (const viewport of viewports) {
  test(`student workspace fits a ${viewport.name} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/?uat-role=student')

    await expect(
      page.getByRole('heading', { name: 'Welcome back, UAT Student' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Student overview' }),
    ).toBeVisible()

    if (viewport.width <= 800) {
      await expect(page.locator('.topbar')).toHaveCSS('position', 'static')
    }

    if (viewport.width <= 360) {
      const accountSettings = await page
        .getByRole('button', { name: 'Account settings' })
        .boundingBox()
      const exitPreview = await page
        .getByRole('button', { name: 'Exit preview' })
        .boundingBox()

      expect(accountSettings?.y).toBe(exitPreview?.y)
    }

    const welcomePosition = await page.locator('.welcome').boundingBox()
    const workspacePosition = await page
      .locator('.dashboard-role-content--student')
      .boundingBox()

    expect(workspacePosition?.y).toBeGreaterThan(welcomePosition?.y ?? 0)

    if (viewport.width <= 760) {
      const menuButton = page.getByRole('button', { name: 'Open menu' })
      await expect(menuButton).toBeVisible()
      await menuButton.click()
      await expect(page.locator('#student-navigation')).toBeVisible()
      await page.getByRole('button', { name: /^Overview/ }).click()
    }

    for (const studentPage of studentPages) {
      await page.evaluate((path) => {
        window.location.hash = path
      }, studentPage.path)
      await expect(
        page.getByRole('heading', { name: studentPage.heading }),
      ).toBeVisible()

      if (studentPage.path === '/student/assessments') {
        await expect(page.locator('.assessment-type-icon--quiz')).toBeVisible()
      }

      if (studentPage.path === '/student/practicals') {
        await expect(page.locator('.assessment-type-icon--cli')).toBeVisible()
      }

      if (studentPage.path === '/student/history') {
        for (const filterName of ['All results', 'Quizzes', 'CLI practicals']) {
          const filter = page
            .locator('.student-history-filters')
            .getByRole('button', { name: new RegExp(`^${filterName}`) })
          await filter.click()
          await expect(filter).toHaveAttribute('aria-pressed', 'true')
        }
      }

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )

      expect(overflow, `${studentPage.path} must fit the ${viewport.name} viewport`)
        .toBeLessThanOrEqual(1)
    }
  })
}
