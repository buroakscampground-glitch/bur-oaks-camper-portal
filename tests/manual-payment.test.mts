import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPaymentAllocationPreview } from '../lib/manual-payment.ts'

const invoices = [
  { id: 'old', invoice_number: '100', invoice_type: 'Electric', due_date: '2026-09-01', status: 'sent', total_due: 75 },
  { id: 'selected', invoice_number: '200', invoice_type: 'Lot Rent', due_date: '2026-10-01', status: 'sent', total_due: 100 },
  { id: 'future', invoice_number: '300', invoice_type: 'Association Fee', due_date: '2027-02-01', status: 'sent', total_due: 50 },
]

test('payment covers the selected invoice first and then other bills by due date', () => {
  const preview = buildPaymentAllocationPreview(invoices, 'selected', 160)
  assert.deepEqual(preview.allocations.map((item) => [item.invoiceId, item.amount]), [['selected', 100], ['old', 60]])
  assert.equal(preview.creditAmount, 0)
})

test('payment reaches future bills and preserves only the true excess as credit', () => {
  const preview = buildPaymentAllocationPreview(invoices, 'selected', 250)
  assert.deepEqual(preview.allocations.map((item) => [item.invoiceId, item.amount]), [['selected', 100], ['old', 75], ['future', 50]])
  assert.equal(preview.appliedTotal, 225)
  assert.equal(preview.creditAmount, 25)
})

test('partial payment leaves the remainder on the selected invoice', () => {
  const preview = buildPaymentAllocationPreview(invoices, 'selected', 40)
  assert.deepEqual(preview.allocations.map((item) => [item.invoiceId, item.amount]), [['selected', 40]])
  assert.equal(preview.creditAmount, 0)
})

test('closed and processing invoices are never allocated', () => {
  const preview = buildPaymentAllocationPreview([
    ...invoices,
    { id: 'paid', status: 'paid', total_due: 500 },
    { id: 'processing', status: 'processing', total_due: 500 },
  ], 'selected', 900)
  assert.equal(preview.appliedTotal, 225)
  assert.equal(preview.creditAmount, 675)
})
