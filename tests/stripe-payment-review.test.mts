import assert from 'node:assert/strict'
import test from 'node:test'
import { priorPaymentReview } from '../lib/stripe-payment-review.ts'

test('the same Stripe payment arriving through two event types is not called a duplicate', () => {
  const review = priorPaymentReview([
    { status: 'paid', payment_reference: 'pi_same' },
  ], 'pi_same')
  assert.equal(review.samePayment, true)
  assert.equal(review.needsReview, false)
})

test('two different payment references require office review', () => {
  const review = priorPaymentReview([
    { status: 'paid', payment_reference: 'pi_first' },
  ], 'pi_second')
  assert.equal(review.samePayment, false)
  assert.equal(review.needsReview, true)
  assert.deepEqual(review.distinctReferences, ['pi_first'])
})

test('a paid invoice without a stored reference is reviewed but never declared a proven refund', () => {
  const review = priorPaymentReview([
    { status: 'paid', payment_reference: null },
  ], 'pi_new')
  assert.equal(review.hasUnknownPriorPayment, true)
  assert.equal(review.needsReview, true)
})
