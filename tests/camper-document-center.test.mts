import assert from 'node:assert/strict'
import test from 'node:test'
import {
  camperCanSignDocument,
  camperDocumentWaitsForAnotherSigner,
  filterCamperDocuments,
  normalizeCamperDocumentFilter,
} from '../lib/camper-document-center.ts'

const email = 'camper@example.com'
const documents = [
  { id: 'action', document_name: 'Rules acknowledgment', document_type: 'Rules', signature_status: 'pending' },
  { id: 'waiting', document_name: 'Two-signer agreement', document_type: 'Agreement', signature_status: 'pending_second_signature', signed_email: email },
  { id: 'renewal', document_name: '2027 Seasonal Renewal', document_type: 'Renewal', signature_status: 'signed' },
  { id: 'insurance', document_name: 'Golf cart insurance', document_type: 'Insurance', signature_status: 'not_required' },
  { id: 'signed', document_name: 'Campground rules', document_type: 'Rules', signature_status: 'signed' },
  { id: 'declined', document_name: 'Prior decision', document_type: 'Notice', signature_status: 'declined' },
]

test('document action filters distinguish my signature from the other signer', () => {
  assert.equal(camperCanSignDocument(documents[0], email), true)
  assert.equal(camperCanSignDocument(documents[1], email), false)
  assert.equal(camperDocumentWaitsForAnotherSigner(documents[1], email), true)
  assert.deepEqual(filterCamperDocuments(documents, 'action', email).map((document) => document.id), ['action'])
  assert.deepEqual(filterCamperDocuments(documents, 'waiting', email).map((document) => document.id), ['waiting'])
})

test('document topic and permanent-record filters do not alter source records', () => {
  assert.deepEqual(filterCamperDocuments(documents, 'renewals', email).map((document) => document.id), ['renewal'])
  assert.deepEqual(filterCamperDocuments(documents, 'insurance', email).map((document) => document.id), ['insurance'])
  assert.deepEqual(filterCamperDocuments(documents, 'signed', email).map((document) => document.id), ['renewal', 'signed'])
  assert.deepEqual(filterCamperDocuments(documents, 'records', email).map((document) => document.id), ['signed', 'declined'])
  assert.equal(documents.length, 6)
})

test('unknown shared filter links fail safely to all documents', () => {
  assert.equal(normalizeCamperDocumentFilter('insurance'), 'insurance')
  assert.equal(normalizeCamperDocumentFilter('made-up-view'), 'all')
  assert.equal(normalizeCamperDocumentFilter(null), 'all')
})

