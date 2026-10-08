import assert from 'node:assert/strict'
import test from 'node:test'
import { centralDayRange, closeoutDateKeys, summarizeCloseoutHistory, summarizeDailyCloseout } from '../lib/daily-closeout.ts'

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
  assert.deepEqual(result.checks, { paymentAllocation: true, paidInvoicesClassified: true, depositsClear: false, moneyExceptionsClear: true })
  assert.equal(result.readyToClose, false)
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
  assert.equal(result.readyToClose, false)
})

test('a fully explained day with clear deposits is ready to close', () => {
  const result = summarizeDailyCloseout({
    invoices: [{ id: 'online', total_due: 50, payment_method: 'Online card' }],
    payouts: [{ amount: 5000, status: 'paid' }],
  })
  assert.deepEqual(result.checks, { paymentAllocation: true, paidInvoicesClassified: true, depositsClear: true, moneyExceptionsClear: true })
  assert.equal(result.readyToClose, true)
})

test('an unresolved money exception blocks closeout without changing ledger totals', () => {
  const result = summarizeDailyCloseout({
    invoices: [{ id: 'online', total_due: 50, payment_method: 'Online card' }],
    payouts: [{ amount: 5000, status: 'paid' }],
    exceptionCount: 2,
  })
  assert.equal(result.totals.received, 50)
  assert.equal(result.counts.moneyExceptions, 2)
  assert.equal(result.checks.moneyExceptionsClear, false)
  assert.equal(result.readyToClose, false)
})

test('seven-day history reconstructs each day from Central-time money records', () => {
  const dates = closeoutDateKeys('2026-10-08', 7)
  const history = summarizeCloseoutHistory({
    dates,
    invoices: [
      { id: 'online-7', total_due: 50, payment_method: 'Online card', paid_at: '2026-10-08T02:00:00Z' },
      { id: 'unknown-8', total_due: 25, payment_method: 'Other', paid_at: '2026-10-08T18:00:00Z' },
    ],
    payouts: [{ amount: 5000, status: 'paid', arrivalDate: '2026-10-07T17:00:00Z' }],
  })
  assert.equal(history.length, 7)
  assert.deepEqual(history.at(-2), { date: '2026-10-07', readyToClose: true, received: 50, bankDeposits: 50, reviewCount: 0 })
  assert.deepEqual(history.at(-1), { date: '2026-10-08', readyToClose: false, received: 0, bankDeposits: 0, reviewCount: 1 })
})

test('Supabase relationship arrays are normalized before money records reach the office view', () => {
  const result = summarizeDailyCloseout({
    invoices: [{ id: 'online', total_due: 25, payment_method: 'Online card', campers: [{ first_name: 'Safe', last_name: 'Shape', lot_number: 'T1' }] }],
    manualPayments: [{ id: 'manual', amount: 10, result: { appliedTotal: 10 }, campers: [{ first_name: 'Office', lot_number: 'T2' }] }],
    manualAllocations: [{ payment_id: 'manual', invoice_id: 'manual-invoice', amount_applied: 10, invoices: [{ invoice_number: 8, invoice_type: 'Electric' }] }],
    onlineExtraCredits: [{ id: 'credit', original_amount: 0, campers: [{ lot_number: 'T1' }] }],
    creditApplications: [{ id: 'application', credit_id: 'old', amount_applied: 5, campers: [{ lot_number: 'T3' }], invoices: [{ invoice_number: 9 }] }],
  })
  assert.equal(result.onlineInvoices[0].campers?.lot_number, 'T1')
  assert.equal(result.manualPayments[0].campers?.first_name, 'Office')
  assert.equal(result.manualAllocations[0].invoices?.invoice_number, 8)
  assert.equal(result.creditApplications[0].invoices?.invoice_number, 9)
})
