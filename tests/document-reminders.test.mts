import assert from 'node:assert/strict'
import test from 'node:test'
import { documentReminderIsDue } from '../lib/document-reminder-schedule.ts'

test('document reminders wait three full Central calendar days', () => {
  assert.equal(documentReminderIsDue('2026-08-30T18:00:00Z', '2026-09-01'), false)
  assert.equal(documentReminderIsDue('2026-08-30T18:00:00Z', '2026-09-02'), true)
})

test('a document with no prior successful notice is due immediately', () => {
  assert.equal(documentReminderIsDue(null, '2026-08-30'), true)
})
