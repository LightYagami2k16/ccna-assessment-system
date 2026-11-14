import { expect, test } from '@playwright/test'

for (const attemptType of ['quiz', 'cli']) {
  test(`${attemptType} fullscreen exits follow the assessment-specific integrity rule`, async ({ page }) => {
    const recordedEvents = []
    await page.route('**/rest/v1/**', async (route) => {
      const payload = route.request().postDataJSON()
      if (payload?.p_event_type) recordedEvents.push(payload.p_event_type)
      await route.fulfill({ json: {
        recorded: true,
        behavior: 'warn',
        incidentCount: 1,
        autoSubmitted: false,
      } })
    })
    await page.goto('/?uat-role=instructor')
    await page.evaluate(async (type) => {
      const { mountIntegrityMonitor } = await import('/tests/fixtures/integrityMonitorHarness.jsx')
      mountIntegrityMonitor(type)
    }, attemptType)
    await page.getByRole('button', { name: 'Enter test fullscreen' }).click()
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)
    await page.evaluate(() => document.exitFullscreen())
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false)

    const recordedHiddenEvent = page.waitForResponse((response) =>
      response.url().includes('/rpc/record_')
      && response.request().postDataJSON()?.p_event_type === 'page_hidden')
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await recordedHiddenEvent
    expect(recordedEvents).toContain('page_hidden')
    if (attemptType === 'quiz') {
      expect(recordedEvents).not.toContain('fullscreen_exited')
      expect(await page.evaluate(() => window.integrityTestIncidents))
        .not.toContain('fullscreen_exited')
    } else {
      await expect.poll(() => recordedEvents).toContain('fullscreen_exited')
      await expect.poll(() => page.evaluate(() => window.integrityTestIncidents))
        .toContain('fullscreen_exited')
    }
  })
}
