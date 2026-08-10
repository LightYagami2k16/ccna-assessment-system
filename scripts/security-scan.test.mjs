import assert from 'node:assert/strict'
import test from 'node:test'
import { scanTextForSecrets } from './security-scan-lib.mjs'

test('detects representative production secrets without returning values', () => {
  const supabaseSecret = ['sb', 'secret', 'abcdefghijklmnopqrstuvwxyz']
    .join('_')
  const privateKeyHeader = [
    '-----BEGIN', 'PRIVATE', 'KEY-----',
  ].join(' ')
  const privilegedViteVariable = [
    'VITE', 'SERVICE', 'ROLE', 'KEY=unsafe',
  ].join('_')
  const findings = scanTextForSecrets([
    `token=${supabaseSecret}`,
    privateKeyHeader,
    privilegedViteVariable,
  ].join('\n'))

  assert.deepEqual(
    findings.map(({ rule, line }) => ({ rule, line })),
    [
      { rule: 'private-key', line: 2 },
      { rule: 'supabase-secret-key', line: 1 },
      { rule: 'privileged-vite-variable', line: 3 },
    ],
  )
})

test('allows browser-safe configuration and documented placeholders', () => {
  assert.deepEqual(scanTextForSecrets([
    'VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co',
    'VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY',
    'SMTP_PASSWORD=YOUR_SMTP_PASSWORD',
  ].join('\n')), [])
})
