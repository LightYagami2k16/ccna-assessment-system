import { expect, test } from '@playwright/test'

test('cached student workspace shell reopens without a network connection', async ({
  context,
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    await navigator.serviceWorker.ready
    return Boolean(navigator.serviceWorker.controller)
  })

  const cachedUrls = await page.evaluate(async () => {
    const cache = await caches.open('ccna-assessment-shell-v2')
    return (await cache.keys()).map((request) => request.url)
  })
  expect(cachedUrls.some((url) => url.endsWith('/index.html'))).toBe(true)
  expect(cachedUrls.some((url) => url.includes('/assets/index-'))).toBe(true)

  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await context.setOffline(false)
})
