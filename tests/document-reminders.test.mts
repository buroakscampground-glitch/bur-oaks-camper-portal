import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DOCUMENT_SIGNATURE_SMS_ALERT,
  documentReminderIsDue,
} from '../lib/document-reminder-schedule.ts'
import { documentSigningPath, documentSigningUrl } from '../lib/document-signing-link.ts'

test('document reminders wait three full Central calendar days', () => {
  assert.equal(documentReminderIsDue('2026-08-30T18:00:00Z', '2026-09-01'), false)
  assert.equal(documentReminderIsDue('2026-08-30T18:00:00Z', '2026-09-02'), true)
})

test('a document with no prior successful notice is due immediately', () => {
  assert.equal(documentReminderIsDue(null, '2026-08-30'), true)
})

test('document signing texts use an unmistakable action alert', () => {
  assert.equal(DOCUMENT_SIGNATURE_SMS_ALERT, 'DOCUMENT NEEDS SIGNED')
})

test('a signing reminder opens the exact document instead of the general document list', () => {
  assert.equal(documentSigningPath('renewal 123'), '/documents?sign=renewal%20123')
  assert.equal(
    documentSigningUrl('https://www.buroakscampground.com/', 'renewal-123'),
    'https://www.buroakscampground.com/documents?sign=renewal-123',
  )
})
