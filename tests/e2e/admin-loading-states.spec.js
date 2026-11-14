import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'

const administrator = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@example.test',
  user_metadata: { full_name: 'Loading Test Administrator' },
}

const screens = [
  {
    name: 'accounts', path: '/admin/users', endpoint: 'list_user_accounts',
    panel: '.admin-users-panel', heading: 'Account directory',
    loading: 'Loading accounts...', refresh: 'Refresh accounts',
    metrics: '.admin-user-metrics strong', empty: 'No matching accounts',
    records: [{
      user_id: 'account-1', email: 'ada@example.test', full_name: 'Ada Student',
      role: 'student', email_confirmed: true, is_suspended: false,
      created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null,
    }],
  },
  {
    name: 'history', path: '/admin/security', endpoint: 'list_admin_audit_events',
    panel: '.admin-audit-panel', heading: 'Administrator history',
    loading: 'Loading security history...', refresh: 'Refresh history',
    metrics: '.admin-audit-metrics strong', empty: 'No administrator events yet',
    records: [{
      event_id: 'event-1', event_type: 'role_changed', target_user_id: 'account-1',
      target_name: 'Ada Student', target_email: 'ada@example.test',
      actor_name: 'Test Administrator', actor_email: 'admin@example.test',
      details: { previousRole: 'student', newRole: 'instructor' },
      occurred_at: '2026-01-01T00:00:00Z',
    }],
  },
]

// A real persisted session keeps the administrator screens out of UAT preview
// mode, so these tests exercise the same RPC loading paths as production.
async function signInAdministrator(page) {
  await page.route('**/auth/v1/**', (route) => route.fulfill({ json: administrator }))
  await page.goto('/?uat-role=administrator')
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: administrator.id, exp: expiresAt })}.test-signature`
  await page.evaluate(async ({ accessToken }) => {
    const { supabase } = await import('/src/lib/supabase.js')
    const { error } = await supabase.auth.setSession({
      access_token: accessToken, refresh_token: 'test-refresh-token',
    })
    if (error) throw error
  }, { accessToken })
}

async function prepareScreen(page, screen) {
  const pending = []
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === screen.endpoint) {
      pending.push(route)
      return
    }
    await route.fulfill({ json: endpoint === 'profiles'
      ? { id: administrator.id, full_name: 'Loading Test Administrator', role: 'administrator', password_change_required: false }
      : [] })
  })
  await signInAdministrator(page)
  await page.goto(`/#${screen.path}`)
  return async (json, status = 200) => {
    await expect.poll(() => pending.length).toBeGreaterThan(0)
    const requests = pending.splice(0)
    await Promise.all(requests.map((route) => route.fulfill({ status, json })))
  }
}

for (const screen of screens) {
  test(`administrator ${screen.name} keeps its panel and records visible while loading and after refresh errors`, async ({ page }) => {
    const respond = await prepareScreen(page, screen)
    const panel = page.locator(screen.panel)
    await expect(panel.getByRole('heading', { name: screen.heading })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Administrator tools' })).toBeVisible()
    await expect(panel.getByText(screen.loading, { exact: true })).toBeVisible()
    await expect(panel.locator(screen.metrics)).toHaveText(['—', '—', '—', '—'])
    await expect(panel.getByText(screen.empty, { exact: true })).toHaveCount(0)
    await respond(screen.records)
    const search = screen.name === 'history'
      ? panel.getByLabel('Search accounts or administrators')
      : panel.getByRole('searchbox', { name: 'Search accounts' })
    if (screen.name === 'history') {
      await panel.getByRole('button', { name: /Role changes/ }).click()
    }
    await search.fill('Ada')
    await expect(panel.getByText('Ada Student', { exact: true })).toBeVisible()
    await expect(search).toHaveValue('Ada')
    await expect(panel.locator(screen.metrics).first()).toHaveText('1')
    await panel.getByRole('button', { name: screen.refresh, exact: true }).click()
    await expect(panel.getByRole('button', { name: 'Refreshing...', exact: true })).toBeDisabled()
    await expect(panel.getByText(screen.loading, { exact: true })).toHaveCount(0)
    await expect(panel.getByText('Ada Student', { exact: true })).toBeVisible()
    if (screen.name === 'history') {
      await expect(panel.getByRole('button', { name: /Role changes/ })).toHaveAttribute('aria-expanded', 'true')
    }
    await respond({ message: 'Refresh temporarily unavailable' }, 500)
    await expect(panel.getByText('Refresh temporarily unavailable', { exact: true })).toBeVisible()
    await expect(panel.getByText('Ada Student', { exact: true })).toBeVisible()
    await expect(search).toHaveValue('Ada')
    await expect(panel.locator(screen.metrics).first()).toHaveText('1')
    await expect(panel.getByRole('button', { name: screen.refresh, exact: true })).toBeEnabled()
    await panel.getByRole('button', { name: screen.refresh, exact: true }).click()
    await respond(screen.records)
    await expect(panel.getByRole('button', { name: screen.refresh, exact: true })).toBeEnabled()
    await expect(panel.getByText('Refresh temporarily unavailable', { exact: true })).toHaveCount(0)
  })

  test(`administrator ${screen.name} shows unavailable content after its first load fails and can retry`, async ({ page }) => {
    const respond = await prepareScreen(page, screen)
    const panel = page.locator(screen.panel)
    await expect(panel.getByText(screen.loading, { exact: true })).toBeVisible()
    await respond({ message: 'Initial request failed' }, 500)
    await expect(panel.getByText('Initial request failed', { exact: true })).toBeVisible()
    await expect(panel.getByText('Content unavailable. Refresh to try again.', { exact: true })).toBeVisible()
    await expect(panel.locator(screen.metrics)).toHaveText(['—', '—', '—', '—'])
    await expect(panel.getByText(screen.empty, { exact: true })).toHaveCount(0)
    await panel.getByRole('button', { name: screen.refresh, exact: true }).click()
    await respond([])
    await expect(panel.getByText(screen.empty, { exact: true })).toBeVisible()
    await expect(panel.locator(screen.metrics)).toHaveText(['0', '0', '0', '0'])
  })
}
