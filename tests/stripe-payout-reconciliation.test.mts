import test from 'node:test'
import assert from 'node:assert/strict'
import { invoiceIdsFromMetadata, isPayoutComponentTransaction, summarizePayoutRows, type StripePayoutRow } from '../lib/stripe-payout-reconciliation.ts'
import { buildStripePayoutPdf } from '../lib/stripe-payout-report.ts'
import { PDFDocument } from 'pdf-lib'

test('reads both single and grouped invoice metadata without duplicates', () => {
  assert.deepEqual(invoiceIdsFromMetadata({ invoice_id: 'a', invoice_ids: '["a","b"]' } as any), ['a', 'b'])
  assert.deepEqual(invoiceIdsFromMetadata({ invoice_ids: 'not-json' } as any), [])
})

test('does not count the bank-transfer ledger row as a payout component', () => {
  assert.equal(isPayoutComponentTransaction({ type: 'payout' } as any), false)
  assert.equal(isPayoutComponentTransaction({ type: 'charge' } as any), true)
})

test('reconciles gross payments, refunds, fees, and net payout to the penny', () => {
  const base = { sourceId: '', created: '2026-09-02T00:00:00Z', description: '', camperCheckoutFeeCents: 0, invoices: [] }
  const rows: StripePayoutRow[] = [
    { ...base, id: 'one', type: 'charge', grossCents: 50000, feeCents: -1480, netCents: 48520 },
    { ...base, id: 'two', type: 'charge', grossCents: 30000, feeCents: -900, netCents: 29100 },
    { ...base, id: 'three', type: 'refund', grossCents: -500, feeCents: 0, netCents: -500 },
  ]
  assert.deepEqual(summarizePayoutRows(rows, 77120), {
    paymentGrossCents: 80000,
    refundsCents: -500,
    adjustmentsCents: 0,
    stripeFeesCents: -2380,
    calculatedNetCents: 77120,
    payoutCents: 77120,
    differenceCents: 0,
    transactionCount: 3,
  })
})

test('creates a printable itemized deposit report', async () => {
  const rows: StripePayoutRow[] = Array.from({ length: 16 }, (_, index) => ({
    id: `txn-${index}`,
    sourceId: `pi-${index}`,
    created: '2026-09-02T13:00:00Z',
    type: 'charge',
    description: 'Camper payment',
    grossCents: 10000,
    feeCents: -320,
    netCents: 9680,
    camperCheckoutFeeCents: 0,
    invoices: [{ id: `invoice-${index}`, invoiceNumber: `INV-${index}`, invoiceType: 'Lot Rent', camper: 'Test Camper', lot: String(index + 1), amountCents: 10000 }],
  }))
  const payoutCents = rows.reduce((sum, row) => sum + row.netCents, 0)
  const bytes = await buildStripePayoutPdf({ id: 'po_test', amountCents: payoutCents, currency: 'usd', status: 'paid', created: '2026-09-02T13:00:00Z', arrivalDate: '2026-09-03T13:00:00Z', automatic: true, method: 'standard', rows, summary: summarizePayoutRows(rows, payoutCents) })
  const pdf = await PDFDocument.load(bytes)
  assert.equal(pdf.getPageCount(), 2)
})
