import { expect, test } from '@playwright/test'

test('static application shell tolerates a small concurrent classroom burst', async ({ request }) => {
  const start = Date.now()
  const responses = await Promise.all(
    Array.from({ length: 20 }, () => request.get('/?uat-role=student')),
  )
  const elapsed = Date.now() - start

  expect(responses.every((response) => response.ok())).toBeTruthy()
  expect(elapsed).toBeLessThan(10000)
})

