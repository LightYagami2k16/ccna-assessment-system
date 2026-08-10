import assert from 'node:assert/strict'
import test from 'node:test'
import { createErrorTelemetry } from './errorTelemetry.js'

test('creates privacy-conscious bounded error telemetry', () => {
  const telemetry = createErrorTelemetry(
    new Error(`Request failed at https://example.test/private?token=secret ${'x'.repeat(600)}`),
    {
      kind: 'react_render',
      path: '/instructor/results?student=private',
      component: 'ResultsPanel',
      online: true,
      viewportWidth: 1280,
    },
  )

  assert.equal(telemetry.kind, 'react_render')
  assert.doesNotMatch(telemetry.message, /token=secret/)
  assert.ok(telemetry.message.length <= 500)
  assert.equal(telemetry.context.viewportWidth, 1280)
})

test('normalizes non-Error rejection values', () => {
  const telemetry = createErrorTelemetry('Promise failed', {
    kind: 'unhandled_promise',
  })
  assert.equal(telemetry.name, 'Error')
  assert.equal(telemetry.message, 'Promise failed')
})

