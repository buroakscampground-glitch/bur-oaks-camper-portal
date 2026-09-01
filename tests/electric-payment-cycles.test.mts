import assert from 'node:assert/strict'
import test from 'node:test'
import { rollingElectricPaymentCycles } from '../lib/electric-payment-cycles.ts'

test('electric dashboard keeps previous and current billing months visible', () => {
  const cycles = rollingElectricPaymentCycles({
    currentMonth: '2026-09',
    readings: [
      { invoice_id: 'aug-paid', reading_date: '2026-08-30' },
      { invoice_id: 'aug-open', reading_date: '2026-08-31' },
      { invoice_id: 'sep-open', reading_date: '2026-09-30' },
    ],
    invoices: [
      { id: 'aug-paid', invoice_type: 'Electric', status: 'paid', total_due: 80, created_at: '2026-09-01T01:00:00Z', due_date: '2026-09-10', paid_at: '2026-09-05T12:00:00Z' },
      { id: 'aug-open', invoice_type: 'Electric', status: 'sent', total_due: 40, created_at: '2026-09-01T01:05:00Z', due_date: '2026-09-10' },
      { id: 'sep-open', invoice_type: 'Electric', status: 'sent', total_due: 60, created_at: '2026-09-30T20:00:00Z', due_date: '2026-10-10' },
    ],
  })

  assert.deepEqual(cycles.map((cycle) => cycle.month), ['2026-08', '2026-09'])
  assert.deepEqual(cycles[0], {
    month: '2026-08', label: 'August 2026', billed: 120, paid: 80, outstanding: 40,
    invoiceCount: 2, paidCount: 1, openCount: 1,
  })
  assert.equal(cycles[1].outstanding, 60)
  assert.equal(cycles[1].paidCount, 0)
})

test('an electric due date in the next month does not move its billing cycle', () => {
  const [august] = rollingElectricPaymentCycles({
    currentMonth: '2026-09',
    readings: [{ invoice_id: 'invoice-1', reading_date: '2026-08-31' }],
    invoices: [{ id: 'invoice-1', invoice_type: 'Electric + Water', status: 'sent', total_due: 25, created_at: '2026-08-31T23:00:00Z', due_date: '2026-09-10' }],
  })
  assert.equal(august.invoiceCount, 1)
  assert.equal(august.outstanding, 25)
})
