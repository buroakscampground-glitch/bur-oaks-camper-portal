import assert from 'node:assert/strict'
import test from 'node:test'
import {
  creationInvoiceNoticeKind,
  daysUntilDate,
  shouldSendUpcomingInvoiceNotice,
} from '../lib/invoice-reminder-schedule.ts'

test('advance invoices stay quiet until the 30-day window', () => {
  assert.equal(daysUntilDate('2026-04-01', '2026-01-01'), 90)
  assert.equal(creationInvoiceNoticeKind('2026-04-01', '2026-01-01'), null)
  assert.equal(creationInvoiceNoticeKind('2026-01-31', '2026-01-01'), 'upcoming')
  assert.equal(creationInvoiceNoticeKind('2026-01-20', '2026-01-01'), 'upcoming')
})

test('daily monitoring catches a missed 30-day run without duplicating notices', () => {
  assert.equal(shouldSendUpcomingInvoiceNotice(30, false), true)
  assert.equal(shouldSendUpcomingInvoiceNotice(29, false), true)
  assert.equal(shouldSendUpcomingInvoiceNotice(29, true), false)
  assert.equal(shouldSendUpcomingInvoiceNotice(3, false), false)
  assert.equal(shouldSendUpcomingInvoiceNotice(45, false), false)
})
