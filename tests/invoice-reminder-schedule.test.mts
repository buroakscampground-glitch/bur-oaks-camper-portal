import assert from 'node:assert/strict'
import test from 'node:test'
import {
  creationInvoiceNoticeKind,
  daysUntilDate,
  pastDueReminderMilestone,
  scheduledInvoiceNoticeKind,
  shouldSendUpcomingInvoiceNotice,
} from '../lib/invoice-reminder-schedule.ts'

test('advance invoices stay quiet until the 30-day window', () => {
  assert.equal(daysUntilDate('2026-04-01', '2026-01-01'), 90)
  assert.equal(creationInvoiceNoticeKind('2026-04-01', '2026-01-01'), null)
  assert.equal(creationInvoiceNoticeKind('2026-01-31', '2026-01-01'), 'upcoming')
  assert.equal(creationInvoiceNoticeKind('2026-01-20', '2026-01-01'), 'upcoming')
  assert.equal(creationInvoiceNoticeKind('2025-12-31', '2026-01-01'), 'past_due')
})

test('daily invoice sequence uses catch-up windows and repeatable past-due milestones', () => {
  assert.equal(scheduledInvoiceNoticeKind(31), null)
  assert.equal(scheduledInvoiceNoticeKind(30), 'upcoming')
  assert.equal(scheduledInvoiceNoticeKind(4), 'upcoming')
  assert.equal(scheduledInvoiceNoticeKind(3), 'due_3_days')
  assert.equal(scheduledInvoiceNoticeKind(2), 'due_3_days')
  assert.equal(scheduledInvoiceNoticeKind(1), 'due_1_day')
  assert.equal(scheduledInvoiceNoticeKind(0), 'due_today')
  assert.equal(scheduledInvoiceNoticeKind(-1), 'past_due')

  assert.equal(pastDueReminderMilestone(1), 1)
  assert.equal(pastDueReminderMilestone(6), 1)
  assert.equal(pastDueReminderMilestone(7), 7)
  assert.equal(pastDueReminderMilestone(14), 14)
  assert.equal(pastDueReminderMilestone(31), 30)
  assert.equal(pastDueReminderMilestone(65), 60)
})

test('daily monitoring catches a missed 30-day run without duplicating notices', () => {
  assert.equal(shouldSendUpcomingInvoiceNotice(30, false), true)
  assert.equal(shouldSendUpcomingInvoiceNotice(29, false), true)
  assert.equal(shouldSendUpcomingInvoiceNotice(29, true), false)
  assert.equal(shouldSendUpcomingInvoiceNotice(3, false), false)
  assert.equal(shouldSendUpcomingInvoiceNotice(45, false), false)
})
