import assert from 'node:assert/strict'
import test from 'node:test'
import { effectiveRenewalStatus } from '../lib/renewal-document-status.ts'

test('a fully signed renewal cannot remain awaiting camper response', () => {
  assert.equal(effectiveRenewalStatus('Awaiting Response', 'signed'), 'Renewing')
})

test('a declined renewal cannot remain awaiting camper response', () => {
  assert.equal(effectiveRenewalStatus('Awaiting Response', 'declined'), 'Camper Leaving')
})

test('pending documents remain awaiting camper response', () => {
  assert.equal(effectiveRenewalStatus('Awaiting Response', 'pending'), 'Awaiting Response')
})

test('a campground decision is never overwritten by document state', () => {
  assert.equal(effectiveRenewalStatus('Campground Not Renewing', 'signed'), 'Campground Not Renewing')
})
