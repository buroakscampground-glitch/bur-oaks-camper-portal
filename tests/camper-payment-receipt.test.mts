import assert from 'node:assert/strict'
import test from 'node:test'
import { loadCamperPaymentReceipt } from '../lib/camper-payment-receipt.ts'

class Query {
  filters: Array<[string, unknown]> = []
  rows: any[]
  constructor(rows: any[]) { this.rows = rows }
  select() { return this }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this }
  in(column: string, values: unknown[]) { this.filters.push([column, values]); return this }
  order() { return this }
  limit() { return this }
  then(resolve: (value: any) => unknown) {
    const data = this.rows.filter((row) => this.filters.every(([column, value]) =>
      Array.isArray(value) ? value.map(String).includes(String(row[column])) : String(row[column]) === String(value)
    ))
    return Promise.resolve(resolve({ data, error: null }))
  }
}

function admin(tables: Record<string, any[]>) {
  return { from: (table: string) => new Query(tables[table] || []) }
}

test('online receipt joins multiple invoices and a protected extra-payment credit', async () => {
  const paymentReference = 'provider-secret-reference'
  const receipt = await loadCamperPaymentReceipt(admin({
    invoices: [
      { id: 'one', camper_id: 'camper', invoice_number: '100', invoice_type: 'Lot Rent', total_due: 500, status: 'paid', payment_method: 'Online card', payment_reference: paymentReference, paid_at: '2026-10-07T15:15:00Z' },
      { id: 'two', camper_id: 'camper', invoice_number: '101', invoice_type: 'Electric', total_due: 100, status: 'paid', payment_method: 'Online card', payment_reference: paymentReference, paid_at: '2026-10-07T15:15:00Z' },
    ],
    account_credits: [{ camper_id: 'camper', original_amount: 50, remaining_amount: 35, applies_to: 'lot_rent', source_reference: `stripe-extra:${paymentReference}` }],
  }), 'camper', {
    id: 'one', camper_id: 'camper', invoice_number: '100', invoice_type: 'Lot Rent', total_due: 500, status: 'paid', payment_method: 'Online card', payment_reference: paymentReference, paid_at: '2026-10-07T15:15:00Z',
  })

  assert.equal(receipt?.kind, 'online')
  assert.equal(receipt?.totalReceived, 650)
  assert.deepEqual(receipt?.allocations.map((item) => [item.invoiceNumber, item.amount]), [['100', 500], ['101', 100]])
  assert.deepEqual(receipt?.savedCredit, { amount: 50, remainingAmount: 35, destination: 'lot_rent' })
  assert.equal(JSON.stringify(receipt).includes(paymentReference), false)
})

test('unpaid invoices never receive a receipt', async () => {
  const receipt = await loadCamperPaymentReceipt(admin({}), 'camper', { id: 'open', status: 'sent', total_due: 25 })
  assert.equal(receipt, null)
})

test('office payment uses manual allocations instead of treating its reference as an online payment', async () => {
  const receipt = await loadCamperPaymentReceipt(admin({
    manual_payment_allocations: [
      { payment_id: 'payment', camper_id: 'camper', invoice_id: 'one', amount_applied: 80 },
      { payment_id: 'payment', camper_id: 'camper', invoice_id: 'two', amount_applied: 20 },
    ],
    manual_payments: [{ id: 'payment', camper_id: 'camper', amount: 125, payment_method: 'Check', received_on: '2026-10-07', credit_id: 'credit', result: { creditAmount: 25 } }],
    invoices: [
      { id: 'one', camper_id: 'camper', invoice_number: '200', invoice_type: 'Electric' },
      { id: 'two', camper_id: 'camper', invoice_number: '201', invoice_type: 'Pump-out' },
    ],
    account_credits: [{ id: 'credit', camper_id: 'camper', remaining_amount: 25, applies_to: 'general' }],
  }), 'camper', {
    id: 'one', camper_id: 'camper', invoice_number: '200', invoice_type: 'Electric', total_due: 80, status: 'paid', payment_method: 'Check', payment_reference: 'check 123', paid_at: '2026-10-07T12:00:00Z',
  })

  assert.equal(receipt?.kind, 'manual')
  assert.equal(receipt?.totalReceived, 125)
  assert.deepEqual(receipt?.allocations.map((item) => item.amount), [80, 20])
  assert.deepEqual(receipt?.savedCredit, { amount: 25, remainingAmount: 25, destination: 'general' })
})
