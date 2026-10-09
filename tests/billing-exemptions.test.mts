import assert from 'node:assert/strict'
import test from 'node:test'
import { isLotRentExemptCamper, isNoBillingLot, noBillingReason } from '../lib/billing-exemptions.ts'

const policies: any[] = [
  { id: 'no-billing-48', policy_type: 'billing_disabled', lot_number: '48', reason: 'Active camper site; billing disabled by office policy.', effective_on: '2026-01-01', active: true },
  { id: 'rent-exempt-charlie', policy_type: 'lot_rent_exempt', camper_id: 'charlie-id', lot_number: '47', reason: 'Office-approved rent exemption.', effective_on: '2026-01-01', active: true },
]

test('Lot 48 stays a camper site while billing remains disabled', () => {
  assert.equal(isNoBillingLot('48', policies), true)
  assert.equal(isNoBillingLot('Lot 48', policies), true)
  assert.match(noBillingReason('48', policies), /active camper site/i)
})

test('other camper sites continue through normal billing', () => {
  assert.equal(isNoBillingLot('48A', policies), false)
  assert.equal(isNoBillingLot('47', policies), false)
})

test('the exact approved camper remains billable for services but is exempt from lot rent', () => {
  assert.equal(isLotRentExemptCamper({ id: 'charlie-id', lot_number: '47' }, policies), true)
  assert.equal(isLotRentExemptCamper({ id: 'another-id', lot_number: '47' }, policies), false)
  assert.equal(isLotRentExemptCamper({ id: 'charlie-id', lot_number: '48' }, policies), true)
})
