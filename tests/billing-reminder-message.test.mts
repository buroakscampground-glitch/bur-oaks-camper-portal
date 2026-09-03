import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBillingReminderMessage } from '../lib/billing-reminder-message.ts'

test('billing reminder includes both the open balance and past-due portion', () => {
  const message = buildBillingReminderMessage([
    { invoice_number: 'RENT-FF2-20260901', status: 'sent', total_due: 750, due_date: '2026-09-01' },
    { invoice_number: 'ELECTRIC-FF2', status: 'sent', total_due: 31.5, due_date: '2026-09-12' },
  ], '2026-09-03')

  assert.equal(
    message,
    'Your Bur Oaks account has an open balance of $781.50. Of that, $750.00 is past due; the oldest past-due invoice was due Sep 1, 2026. Please check your camper portal or contact the office with questions.'
  )
})

test('billing reminder does not call a future balance past due', () => {
  const message = buildBillingReminderMessage([
    { status: 'sent', total_due: 31.5, due_date: '2026-09-12' },
  ], '2026-09-03')

  assert.match(message, /open balance of \$31\.50/)
  assert.doesNotMatch(message, /past due/)
})

test('billing reminder excludes paid invoices', () => {
  const message = buildBillingReminderMessage([
    { status: 'paid', total_due: 750, due_date: '2026-09-01' },
    { status: 'sent', total_due: 31.5, due_date: '2026-09-12' },
  ], '2026-09-03')

  assert.match(message, /\$31\.50/)
  assert.doesNotMatch(message, /\$781\.50|\$750\.00/)
})
