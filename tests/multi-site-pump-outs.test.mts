import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  allowedPumpOutServiceLot,
  pumpOutBillingLotForService,
  pumpOutServiceAccountsForAccount,
  pumpOutServiceLotsForAccount,
} from '../lib/multi-site-pump-outs.ts'

const policies: any[] = [
  ['denise', 'billing_delegate', 'dmonke69@yahoo.com', 'FF2', null],
  ['stacy', 'billing_delegate', 'stacymcnish@yahoo.com', 'FF12', null],
  ['clairice-billing', 'billing_delegate', 'neter85@gmail.com', 'TEMP 1', null],
  ['clairice-pump', 'pump_out_service_access', 'neter85@gmail.com', '18', 'TEMP 1'],
].map(([id, policy_type, subject_email, lot_number, related_lot_number]) => ({ id, policy_type, subject_email, lot_number, related_lot_number, reason: 'Approved account access.', effective_on: '2026-01-01', active: true }))

test('Clairice can request either physical campsite from the Lot 18 billing account', () => {
  assert.deepEqual(pumpOutServiceLotsForAccount(' NETER85@GMAIL.COM ', '18', policies), ['18', 'TEMP 1'])
  assert.equal(allowedPumpOutServiceLot('neter85@gmail.com', '18', 'temp 1', policies), 'TEMP 1')
  assert.equal(allowedPumpOutServiceLot('neter85@gmail.com', '18', '20', policies), '')
})

test('Denise can choose her own campsite or William Trader’s authorized FF2 account', () => {
  assert.deepEqual(pumpOutServiceLotsForAccount('dmonke69@yahoo.com', 'FF15', policies), ['FF15', 'FF2'])
  assert.deepEqual(pumpOutServiceAccountsForAccount('dmonke69@yahoo.com', 'FF15', policies), [
    { serviceLot: 'FF15', billingLot: 'FF15' },
    { serviceLot: 'FF2', billingLot: 'FF2' },
  ])
  assert.equal(allowedPumpOutServiceLot('dmonke69@yahoo.com', 'FF15', 'ff2', policies), 'FF2')
  assert.equal(pumpOutBillingLotForService('dmonke69@yahoo.com', 'FF15', 'ff2', policies), 'FF2')
  assert.deepEqual(
    pumpOutServiceLotsForAccount(['denise-login@example.com', 'dmonke69@yahoo.com'], 'FF15', policies),
    ['FF15', 'FF2']
  )
})

test('all three authorized family logins inherit their linked campsite in the pump-out picker', () => {
  assert.deepEqual(pumpOutServiceLotsForAccount('stacymcnish@yahoo.com', '5', policies), ['5', 'FF12'])
  assert.deepEqual(pumpOutServiceLotsForAccount('neter85@gmail.com', '18', policies), ['18', 'TEMP 1'])
  assert.equal(pumpOutBillingLotForService('neter85@gmail.com', '18', 'TEMP 1', policies), '18')
})

test('other camper accounts remain limited to their own campsite', () => {
  assert.deepEqual(pumpOutServiceLotsForAccount('camper@example.com', '39', policies), ['39'])
  assert.equal(allowedPumpOutServiceLot('camper@example.com', '39', '39', policies), '39')
  assert.equal(allowedPumpOutServiceLot('camper@example.com', '39', 'TEMP 1', policies), '')
})

test('the portal labels the family campsite and bills the linked owner record', async () => {
  const [portal, route] = await Promise.all([
    readFile(new URL('../app/portal/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/sewer-pump-out/route.ts', import.meta.url), 'utf8'),
  ])
  assert.match(portal, /Pump Lot \$\{lot\}.*pumpOutAccountFirstName/)
  assert.match(portal, /Which lot needs a pump-out\?/)
  assert.match(portal, /portal-pump-lot-picker/)
  assert.match(portal, /selectedPumpBillingName/)
  assert.match(route, /p_camper_id: billingCamper\.id/)
  assert.match(route, /billingLot,/)
})
