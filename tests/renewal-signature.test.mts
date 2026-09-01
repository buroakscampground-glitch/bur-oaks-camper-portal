import assert from 'node:assert/strict'
import test from 'node:test'
import { hasSecureRenewalSignature } from '../lib/renewal-signature.ts'

const secureSignature = {
  signature_status: 'signed',
  signed_at: '2026-09-01T12:00:00.000Z',
  signed_name: 'Camper Name',
  signature_record_hash: 'proof-hash',
}

test('a renewal needs a typed name, date, and secure proof', () => {
  assert.equal(hasSecureRenewalSignature(secureSignature), true)
  assert.equal(hasSecureRenewalSignature({ ...secureSignature, signed_name: '' }), false)
  assert.equal(hasSecureRenewalSignature({ ...secureSignature, signed_at: null }), false)
  assert.equal(hasSecureRenewalSignature({ ...secureSignature, signature_record_hash: null }), false)
})

test('a two-person renewal is incomplete until both secure signatures exist', () => {
  assert.equal(hasSecureRenewalSignature({ ...secureSignature, requires_two_signatures: true }), false)
  assert.equal(hasSecureRenewalSignature({
    ...secureSignature,
    requires_two_signatures: true,
    second_signed_name: 'Second Camper',
    second_signature_record_hash: 'second-proof-hash',
  }), true)
})
