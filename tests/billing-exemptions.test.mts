import assert from 'node:assert/strict'
import test from 'node:test'
import { isNoBillingLot, noBillingReason } from '../lib/billing-exemptions.ts'

test('Lot 48 stays a camper site while billing remains disabled', () => {
  assert.equal(isNoBillingLot('48'), true)
  assert.equal(isNoBillingLot('Lot 48'), true)
  assert.match(noBillingReason('48'), /active camper site/i)
})

test('other camper sites continue through normal billing', () => {
  assert.equal(isNoBillingLot('48A'), false)
  assert.equal(isNoBillingLot('47'), false)
})
