import { expect, test } from '@playwright/test'

test('production authentication entry point is healthy', async ({ page }) => {
  const browserErrors = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text())
    }
  })

  page.on('pageerror', (error) => {
    browserErrors.push(error.message)
  })

  const response = await page.goto('./', {
    waitUntil: 'domcontentloaded',
  })

  expect(response?.ok()).toBe(true)
  await expect(page).toHaveTitle('CCNA Assessment System')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()

  const policyElement = page.locator(
    'meta[http-equiv="Content-Security-Policy"]',
  )

  await expect(
    policyElement,
    'The deployed HTML must include the production Content Security Policy.',
  ).toHaveCount(1)

  const contentSecurityPolicy = await policyElement.getAttribute('content')

  expect(contentSecurityPolicy).toContain("default-src 'self'")
  expect(contentSecurityPolicy).toContain("object-src 'none'")
  expect(contentSecurityPolicy).not.toContain('*')

  await expect(page.locator('meta[name="referrer"]'))
    .toHaveAttribute('content', 'strict-origin-when-cross-origin')

  await page.getByRole('button', { name: 'Create an account' }).click()
  await expect(
    page.getByRole('heading', { name: 'Create student account' }),
  ).toBeVisible()
  await expect(page.getByLabel('Full name')).toBeVisible()

  await page.getByRole('button', { name: 'Return to sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  expect(browserErrors).toEqual([])
})
