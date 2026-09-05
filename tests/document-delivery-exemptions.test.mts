import assert from 'node:assert/strict'
import test from 'node:test'
import { isDocumentDeliveryExcluded } from '../lib/document-delivery-exemptions.ts'

test('Anthony Finley at Lot 48 is excluded from document delivery', () => {
  assert.equal(isDocumentDeliveryExcluded({ lot_number: '48', first_name: 'Anthony', last_name: 'Finley' }), true)
  assert.equal(isDocumentDeliveryExcluded({ lot_number: '48', first_name: 'Dawn', last_name: 'Finley' }), false)
  assert.equal(isDocumentDeliveryExcluded({ lot_number: '47', first_name: 'Anthony', last_name: 'Finley' }), false)
})
