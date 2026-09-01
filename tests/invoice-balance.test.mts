import assert from 'node:assert/strict'
import test from 'node:test'
import { isInvoiceDueNow, isInvoiceDueThroughCurrentMonth, isInvoiceUpcoming, totalInvoiceBalance } from '../lib/invoice-balance.ts'

test('amount due excludes future invoices while keeping them upcoming', () => {
  const today = '2026-08-28'
  const invoices = [
    { status: 'open', due_date: '2026-08-27', total_due: 100 },
    { status: 'open', due_date: '2026-08-28', total_due: 50 },
    { status: 'open', due_date: '2026-09-15', total_due: 250 },
    { status: 'paid', due_date: '2026-08-20', total_due: 80 },
  ]

  const dueNow = invoices.filter((invoice) => isInvoiceDueNow(invoice, today))
  const upcoming = invoices.filter((invoice) => isInvoiceUpcoming(invoice, today))

  assert.equal(totalInvoiceBalance(dueNow), 150)
  assert.equal(totalInvoiceBalance(upcoming), 250)
})

test('an open invoice without a due date is due now', () => {
  assert.equal(isInvoiceDueNow({ status: 'open', due_date: null, total_due: 25 }, '2026-08-28'), true)
})

test('monthly amount due includes the current month and unpaid carryover but excludes later months', () => {
  const today = '2026-09-01'
  const invoices = [
    { status: 'open', due_date: '2026-08-15', total_due: 100 },
    { status: 'open', due_date: '2026-09-30', total_due: 200 },
    { status: 'open', due_date: '2026-10-01', total_due: 300 },
    { status: 'paid', due_date: '2026-09-10', total_due: 400 },
  ]

  const amountDueThisMonth = invoices.filter((invoice) => isInvoiceDueThroughCurrentMonth(invoice, today))
  assert.equal(totalInvoiceBalance(amountDueThisMonth), 300)
})
