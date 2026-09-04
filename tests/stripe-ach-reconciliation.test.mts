import assert from 'node:assert/strict'
import test from 'node:test'
import { requiredStripePaymentEvents, stripePaymentResolution } from '../lib/stripe-ach-status.ts'

test('ACH settlement statuses only change invoices after Stripe reaches a final outcome', () => {
  assert.equal(stripePaymentResolution('processing'), 'pending')
  assert.equal(stripePaymentResolution('requires_action'), 'pending')
  assert.equal(stripePaymentResolution('succeeded'), 'paid')
  assert.equal(stripePaymentResolution('requires_payment_method'), 'reopen')
  assert.equal(stripePaymentResolution('canceled'), 'reopen')
})

test('the Stripe webhook includes every event needed to finish or reopen ACH payments', () => {
  assert.deepEqual(requiredStripePaymentEvents, [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'payment_intent.processing',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
  ])
})
