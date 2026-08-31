import assert from 'node:assert/strict'
import test from 'node:test'
import {
  electricChargeRowsSignature,
  electricWaterReviewKey,
} from '../lib/electric-invoice-review.ts'

test('water approval is tied to the camper, inclusion choice, and amount', () => {
  assert.notEqual(electricWaterReviewKey('a', false, 20), electricWaterReviewKey('a', true, 20))
  assert.notEqual(electricWaterReviewKey('a', true, 20), electricWaterReviewKey('a', true, 25))
  assert.notEqual(electricWaterReviewKey('a', true, 20), electricWaterReviewKey('b', true, 20))
})

test('additional charge signature changes when a charge is added or changed', () => {
  const original = electricChargeRowsSignature([{ id: 'pump-1', charge_amount: 15 }])
  assert.equal(original, electricChargeRowsSignature([{ id: 'pump-1', charge_amount: 15 }]))
  assert.notEqual(original, electricChargeRowsSignature([{ id: 'pump-1', charge_amount: 20 }]))
  assert.notEqual(original, electricChargeRowsSignature([
    { id: 'pump-1', charge_amount: 15 },
    { id: 'service-1', charge_amount: 25 },
  ]))
})
