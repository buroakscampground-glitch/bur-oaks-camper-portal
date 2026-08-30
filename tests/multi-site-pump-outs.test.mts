import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allowedPumpOutServiceLot,
  pumpOutServiceLotsForAccount,
} from '../lib/multi-site-pump-outs.ts'

test('Clairice can request either physical campsite from the Lot 18 billing account', () => {
  assert.deepEqual(pumpOutServiceLotsForAccount(' NETER85@GMAIL.COM ', '18'), ['18', 'TEMP 1'])
  assert.equal(allowedPumpOutServiceLot('neter85@gmail.com', '18', 'temp 1'), 'TEMP 1')
  assert.equal(allowedPumpOutServiceLot('neter85@gmail.com', '18', '20'), '')
})

test('other camper accounts remain limited to their own campsite', () => {
  assert.deepEqual(pumpOutServiceLotsForAccount('camper@example.com', '39'), ['39'])
  assert.equal(allowedPumpOutServiceLot('camper@example.com', '39', '39'), '39')
  assert.equal(allowedPumpOutServiceLot('camper@example.com', '39', 'TEMP 1'), '')
})
