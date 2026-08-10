import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrowserSecurityPolicy } from './browser-security-policy.mjs'

test('limits production connections to the application and Supabase project', () => {
  const policy = createBrowserSecurityPolicy(
    'https://project.supabase.co/path',
  )

  assert.match(policy, /default-src 'self'/)
  assert.match(policy, /object-src 'none'/)
  assert.match(policy, /https:\/\/project\.supabase\.co/)
  assert.match(policy, /wss:\/\/project\.supabase\.co/)
  assert.doesNotMatch(policy, /\*/)
})
