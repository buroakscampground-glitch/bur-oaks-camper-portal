import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { operationalRequestId, reportOperationalFailure, supportReferenceMessage } from '../lib/operational-errors.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('an inbound correlation ID is preserved and unsafe characters are removed', () => {
  const request = new Request('https://example.test/api/example', { headers: { 'x-request-id': 'safe-id<script>' } })
  assert.equal(operationalRequestId(request), 'safe-idscript')
})

test('operational failure output is structured, searchable, and excludes sensitive error text', () => {
  const original = console.error
  const lines: unknown[][] = []
  console.error = (...values: unknown[]) => lines.push(values)
  try {
    const request = new Request('https://example.test/api/example?token=secret', { method: 'POST', headers: { 'x-request-id': 'request-123' } })
    const requestId = reportOperationalFailure(request, {
      operation: 'payment-save',
      actorRole: 'camper',
      identifiers: { invoiceId: 'inv_123', empty: '' },
    }, { name: 'DatabaseError', code: 'PGRST500', message: 'email@example.com card 4242' })
    assert.equal(requestId, 'request-123')
    const output = lines.flat().join(' ')
    assert.match(output, /bur-oaks-operational-failure/)
    assert.match(output, /request-123/)
    assert.match(output, /payment-save/)
    assert.match(output, /inv_123/)
    assert.doesNotMatch(output, /email@example\.com|4242|token=secret/)
  } finally {
    console.error = original
  }
})

test('support copy carries the exact searchable request reference', () => {
  assert.equal(supportReferenceMessage('Please contact the office.', 'abc-123'), 'Please contact the office. Reference: abc-123.')
})

test('critical payment, renewal, meter, and notification paths report operational failures', () => {
  const webhook = read('app/api/stripe-webhook/route.ts')
  const renewal = read('app/api/renewal-decision/route.ts')
  const meter = read('app/api/meter-readings/route.ts')
  const texts = read('app/api/text-alerts/route.ts')
  assert.match(webhook, /operation: 'stripe-webhook-processing'/)
  assert.match(renewal, /operation: 'renewal-decision-save'/)
  assert.match(meter, /operation: 'meter-submission-save'/)
  assert.match(texts, /operation: 'manual-text-delivery'/)
})
