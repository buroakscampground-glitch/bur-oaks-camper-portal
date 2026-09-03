import assert from 'node:assert/strict'
import test from 'node:test'
import {
  authorizedContactEmails,
  authorizedDelegateProfilesForLot,
  billingDelegateEmailsForLot,
  billingOwnerLotsForEmail,
} from '../lib/authorized-billing.ts'

test('authorized family payers resolve only to their linked parent campsite', () => {
  assert.deepEqual(billingOwnerLotsForEmail(' DMONKE69@YAHOO.COM '), ['FF2'])
  assert.deepEqual(billingOwnerLotsForEmail('stacymcnish@yahoo.com'), ['FF12'])
  assert.deepEqual(billingOwnerLotsForEmail('neter85@gmail.com'), ['TEMP 1'])
  assert.deepEqual(billingOwnerLotsForEmail('not-linked@example.com'), [])
})

test('William billing and document notices treat Denise like an account holder', () => {
  const william = {
    id: 'william',
    lot_number: 'FF2',
    email: 'william@example.com',
    secondary_email: '',
    active: true,
    role: 'camper',
  }
  const denise = {
    id: 'denise',
    lot_number: 'FF15',
    email: 'dmonke69@yahoo.com',
    secondary_email: 'denise.secondary@example.com',
    active: true,
    role: 'camper',
  }
  const unrelated = {
    id: 'other',
    lot_number: '8',
    email: 'other@example.com',
    active: true,
    role: 'camper',
  }

  assert.deepEqual(authorizedDelegateProfilesForLot(william.lot_number, [denise, unrelated]), [denise])
  assert.deepEqual(
    authorizedContactEmails([william, denise]),
    ['william@example.com', 'dmonke69@yahoo.com', 'denise.secondary@example.com']
  )
})

test('document reminder recipients use the same explicit family-account links', () => {
  assert.deepEqual(billingDelegateEmailsForLot(' ff2 '), ['dmonke69@yahoo.com'])
  assert.deepEqual(billingDelegateEmailsForLot('TEMP 1'), ['neter85@gmail.com'])
  assert.deepEqual(billingDelegateEmailsForLot('5'), [])
})
