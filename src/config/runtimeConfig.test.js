import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import test from 'node:test'
import {
  validatePublicAppUrl,
  validatePublicSupabaseConfig,
} from './runtimeConfig.js'

function jwtWithRole(role) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode({ role })}.signature`
}

test('accepts HTTPS Supabase configuration with a publishable key', () => {
  const config = validatePublicSupabaseConfig({
    url: 'https://project.supabase.co/',
    key: 'sb_publishable_browser_key',
  })
  assert.equal(config.supabaseUrl, 'https://project.supabase.co')
})

test('allows HTTP only for local Supabase development', () => {
  assert.equal(validatePublicSupabaseConfig({
    url: 'http://127.0.0.1:54321',
    key: 'local-anon-key',
  }).supabaseUrl, 'http://127.0.0.1:54321')

  assert.throws(() => validatePublicSupabaseConfig({
    url: 'http://project.supabase.co',
    key: 'sb_publishable_browser_key',
  }), /must use HTTPS/)
})

test('rejects placeholders and privileged browser keys', () => {
  assert.throws(() => validatePublicSupabaseConfig({
    url: 'https://YOUR_PROJECT.supabase.co',
    key: 'sb_publishable_browser_key',
  }), /placeholder/)
  assert.throws(() => validatePublicSupabaseConfig({
    url: 'https://project.supabase.co',
    key: 'sb_secret_server_key',
  }), /must never be used/)
  assert.throws(() => validatePublicSupabaseConfig({
    url: 'https://project.supabase.co',
    key: jwtWithRole('service_role'),
  }), /must never be used/)
})

test('normalizes a production public application URL', () => {
  assert.equal(
    validatePublicAppUrl(
      'https://ccna.school.edu/ccna-assessment-system',
    ),
    'https://ccna.school.edu/ccna-assessment-system/',
  )
})

test('rejects unsafe public application URLs', () => {
  assert.throws(
    () => validatePublicAppUrl('http://ccna.school.edu/app'),
    /must use HTTPS/,
  )
  assert.throws(
    () => validatePublicAppUrl('https://ccna.school.edu/app#recovery'),
    /fragment/,
  )
  assert.throws(
    () => validatePublicAppUrl('http://localhost:5173/app'),
    /must use HTTPS/,
  )
  assert.equal(
    validatePublicAppUrl('http://localhost:5173/app', {
      allowLocal: true,
    }),
    'http://localhost:5173/app/',
  )
})
