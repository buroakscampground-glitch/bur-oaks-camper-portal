import assert from 'node:assert/strict'
import test from 'node:test'
import { achExpectedFromStripeEvent, achExpectedLabel, addAchBusinessDays } from '../lib/ach-expected-date.ts'

test('ACH estimates skip weekends', () => {
  assert.equal(addAchBusinessDays('2026-09-08T22:01:40Z', 5), '2026-09-15')
  assert.equal(addAchBusinessDays('2026-09-11T12:00:00Z', 1), '2026-09-14')
})

test('checkout and processing events use their matching Stripe estimate windows', () => {
  const monday = Date.parse('2026-09-07T19:28:53Z') / 1000
  const tuesday = Date.parse('2026-09-08T22:01:40Z') / 1000
  assert.equal(achExpectedFromStripeEvent(monday, true), '2026-09-15')
  assert.equal(achExpectedFromStripeEvent(tuesday), '2026-09-15')
})

test('processing ACH invoices display a useful expected date', () => {
  const invoice = {
    status: 'processing',
    payment_method: 'Online ACH processing',
    ach_expected_date: '2026-09-15',
  }
  assert.equal(achExpectedLabel(invoice), 'ACH expected Sep 15')
  assert.equal(achExpectedLabel(invoice, 'long'), 'ACH expected September 15')
  assert.equal(achExpectedLabel({ ...invoice, status: 'paid' }), '')
})
