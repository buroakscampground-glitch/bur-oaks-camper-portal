import assert from 'node:assert/strict'
import test from 'node:test'
import { centralDayRange, summarizeDailyCloseout } from '../lib/daily-closeout.ts'

test('daily closeout explains online, office, allocation, and saved-credit dollars', () => {
  const result = summarizeDailyCloseout({
    invoices: [
      { id: 'online-one', status: 'paid', total_due: 500, payment_method: 'Online card' },
      { id: 'manual-invoice', status: 'paid', total_due: 100, payment_method: 'Check' },
    ],
    manualPayments: [{ id: 'manual', amount: 150, credit_id: 'new-credit', result: { creditAmount: 50 } }],
    manualAllocations: [{ payment_id: 'manual', invoice_id: 'manual-invoice', amount_applied: 100 }],
    onlineExtraCredits: [{ original_amount: 25 }],
    creditApplications: [{ credit_id: 'old-credit', amount_applied: 40 }, { credit_id: 'new-credit', amount_applied: 100 }],
    payouts: [{ amount: 57500, status: 'paid' }, { amount: 2000, status: 'failed' }],
  })
  assert.deepEqual(result.totals, {
    received: 675, onlineReceived: 525, manualReceived: 150, invoiceAllocations: 600,
    savedCredit: 75, creditsApplied: 40, bankDeposits: 575, difference: 0,
  })
  assert.equal(result.balanced, true)
  assert.equal(result.counts.payoutProblems, 1)
})

test('Central closeout boundaries honor both daylight-saving transition days', () => {
  const spring = centralDayRange('2026-03-08')
  const fall = centralDayRange('2026-11-01')
  assert.equal((Date.parse(spring.end) - Date.parse(spring.start)) / 3_600_000, 23)
  assert.equal((Date.parse(fall.end) - Date.parse(fall.start)) / 3_600_000, 25)
})

test('credit-paid invoices are not called new cash and unclassified payments block closeout', () => {
  const result = summarizeDailyCloseout({
    invoices: [
      { id: 'credit', status: 'paid', total_due: 90, payment_method: 'Paid by account credit' },
      { id: 'unknown', status: 'paid', total_due: 45, payment_method: 'Other' },
    ],
    creditApplications: [{ credit_id: 'old', invoice_id: 'credit', amount_applied: 90 }],
  })
  assert.equal(result.totals.received, 0)
  assert.equal(result.totals.creditsApplied, 90)
  assert.equal(result.counts.unclassifiedInvoices, 1)
  assert.equal(result.balanced, false)
})
