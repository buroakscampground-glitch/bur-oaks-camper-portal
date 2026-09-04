import assert from 'node:assert/strict'
import test from 'node:test'
import { isInvoiceDueAfterCurrentMonthWithinDays, isInvoiceDueNow, isInvoiceDueThroughCurrentMonth, isInvoiceDueWithinDays, isInvoiceUpcoming, totalInvoiceBalance } from '../lib/invoice-balance.ts'

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

test('void and canceled invoices never appear in camper balances', () => {
  const invoices = [
    { status: 'void', total_due: 100, due_date: '2026-09-01' },
    { status: 'canceled', total_due: 200, due_date: '2026-09-01' },
    { status: 'cancelled', total_due: 300, due_date: '2026-09-01' },
    { status: 'sent', total_due: 50, due_date: '2026-09-01' },
  ]

  assert.equal(totalInvoiceBalance(invoices.filter((invoice) => isInvoiceDueNow(invoice, '2026-09-04'))), 50)
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

test('the upcoming window includes future open invoices through day 30 only', () => {
  const today = '2026-09-04'

  assert.equal(isInvoiceDueWithinDays({ status: 'open', due_date: '2026-09-05' }, 30, today), true)
  assert.equal(isInvoiceDueWithinDays({ status: 'open', due_date: '2026-10-04' }, 30, today), true)
  assert.equal(isInvoiceDueWithinDays({ status: 'open', due_date: '2026-10-05' }, 30, today), false)
  assert.equal(isInvoiceDueWithinDays({ status: 'open', due_date: today }, 30, today), false)
  assert.equal(isInvoiceDueWithinDays({ status: 'paid', due_date: '2026-09-10' }, 30, today), false)
})

test('the admin later-bills window does not repeat bills already shown in the current-month amount due', () => {
  const today = '2026-09-04'

  assert.equal(isInvoiceDueAfterCurrentMonthWithinDays({ status: 'sent', due_date: '2026-09-12' }, 30, today), false)
  assert.equal(isInvoiceDueAfterCurrentMonthWithinDays({ status: 'sent', due_date: '2026-10-01' }, 30, today), true)
  assert.equal(isInvoiceDueAfterCurrentMonthWithinDays({ status: 'sent', due_date: '2026-10-05' }, 30, today), false)
})
