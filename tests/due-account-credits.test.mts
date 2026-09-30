import assert from 'node:assert/strict'
import test from 'node:test'
import { isInvoiceReadyForAccountCredit } from '../lib/due-account-credits.ts'

test('account credit waits until the invoice due date', () => {
  const invoice = { camper_id: 'camper-1', status: 'sent', total_due: 200, due_date: '2026-10-15' }
  assert.equal(isInvoiceReadyForAccountCredit(invoice, '2026-10-14'), false)
  assert.equal(isInvoiceReadyForAccountCredit(invoice, '2026-10-15'), true)
})

test('paid, processing, closed, and empty invoices never consume account credit', () => {
  const base = { camper_id: 'camper-1', total_due: 200, due_date: '2026-10-15' }
  for (const status of ['paid', 'processing', 'void', 'cancelled']) {
    assert.equal(isInvoiceReadyForAccountCredit({ ...base, status }, '2026-10-15'), false)
  }
  assert.equal(isInvoiceReadyForAccountCredit({ ...base, status: 'sent', total_due: 0 }, '2026-10-15'), false)
})

test('past-due invoices can use a newly entered credit on the next billing run', () => {
  const invoice = { camper_id: 'camper-1', status: 'overdue', total_due: 75, due_date: '2026-09-01' }
  assert.equal(isInvoiceReadyForAccountCredit(invoice, '2026-09-30'), true)
})

