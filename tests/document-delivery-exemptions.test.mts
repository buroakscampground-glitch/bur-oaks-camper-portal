import assert from 'node:assert/strict'
import test from 'node:test'
import { isDocumentDeliveryExcluded } from '../lib/document-delivery-exemptions.ts'

const policies: any[] = [
  { id: 'document-exempt', policy_type: 'document_delivery_exempt', camper_id: 'anthony-id', lot_number: '48', reason: 'Office-approved delivery exception.', effective_on: '2026-01-01', active: true },
]

test('only the exact approved camper is excluded from document delivery', () => {
  assert.equal(isDocumentDeliveryExcluded({ id: 'anthony-id', lot_number: '48' }, policies), true)
  assert.equal(isDocumentDeliveryExcluded({ id: 'dawn-id', lot_number: '48' }, policies), false)
  assert.equal(isDocumentDeliveryExcluded({ id: 'anthony-id', lot_number: '47' }, policies), true)
})
