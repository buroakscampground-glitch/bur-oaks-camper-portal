import assert from 'node:assert/strict'
import test from 'node:test'
import {
  billingDelegateEmailsForLot,
  billingOwnerLotsForEmail,
} from '../lib/authorized-billing.ts'

test('authorized family payers resolve only to their linked parent campsite', () => {
  assert.deepEqual(billingOwnerLotsForEmail(' DMONKE69@YAHOO.COM '), ['FF2'])
  assert.deepEqual(billingOwnerLotsForEmail('stacymcnish@yahoo.com'), ['FF12'])
  assert.deepEqual(billingOwnerLotsForEmail('neter85@gmail.com'), ['TEMP 1'])
  assert.deepEqual(billingOwnerLotsForEmail('not-linked@example.com'), [])
})

test('document reminder recipients use the same explicit family-account links', () => {
  assert.deepEqual(billingDelegateEmailsForLot(' ff2 '), ['dmonke69@yahoo.com'])
  assert.deepEqual(billingDelegateEmailsForLot('TEMP 1'), ['neter85@gmail.com'])
  assert.deepEqual(billingDelegateEmailsForLot('5'), [])
})
