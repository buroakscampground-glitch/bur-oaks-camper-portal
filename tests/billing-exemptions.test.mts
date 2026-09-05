import assert from 'node:assert/strict'
import test from 'node:test'
import { isLotRentExemptCamper, isNoBillingLot, noBillingReason } from '../lib/billing-exemptions.ts'

test('Lot 48 stays a camper site while billing remains disabled', () => {
  assert.equal(isNoBillingLot('48'), true)
  assert.equal(isNoBillingLot('Lot 48'), true)
  assert.match(noBillingReason('48'), /active camper site/i)
})

test('other camper sites continue through normal billing', () => {
  assert.equal(isNoBillingLot('48A'), false)
  assert.equal(isNoBillingLot('47'), false)
})

test('Charlie Kimball remains billable for services but is exempt from lot rent', () => {
  assert.equal(isLotRentExemptCamper({ lot_number: '47', first_name: 'Charlie', last_name: 'Kimball' }), true)
  assert.equal(isLotRentExemptCamper({ lot_number: '47', first_name: 'Another', last_name: 'Camper' }), false)
  assert.equal(isLotRentExemptCamper({ lot_number: '48', first_name: 'Charlie', last_name: 'Kimball' }), false)
})
