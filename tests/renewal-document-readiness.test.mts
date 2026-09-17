import assert from 'node:assert/strict'
import test from 'node:test'
import { isRenewalDocument, renewalDocumentHasRequiredDetails } from '../lib/renewal-document-readiness.ts'

test('renewal documents are recognized by name or type', () => {
  assert.equal(isRenewalDocument({ document_name: '2027 Renewal Form for Docusign' }), true)
  assert.equal(isRenewalDocument({ document_type: 'Seasonal Renewal' }), true)
  assert.equal(isRenewalDocument({ document_name: 'Golf Cart Insurance' }), false)
})

test('an incomplete renewal cannot be presented for reminders or signature', () => {
  const camper = { first_name: 'Jane', last_name: 'Camper' }
  assert.equal(renewalDocumentHasRequiredDetails(null, camper), false)
  assert.equal(renewalDocumentHasRequiredDetails({ lot_number: '', contract_end_date: '2027-09-30' }, camper), false)
  assert.equal(renewalDocumentHasRequiredDetails({ lot_number: '12', contract_end_date: '' }, camper), false)
  assert.equal(renewalDocumentHasRequiredDetails({ lot_number: '12', contract_end_date: '2027-09-30' }, camper), true)
})
