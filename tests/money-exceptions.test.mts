import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMoneyExceptionQueue } from '../lib/money-exceptions.ts'

test('money exception queue links processor problems to exact campground records', () => {
  const queue = buildMoneyExceptionQueue({
    lateAchInvoices: [{ id: 'invoice-ach', invoice_number: 41, total_due: 72, ach_expected_date: '2026-10-01', campers: { lot_number: '9' } }],
    unmatchedInvoices: [{ id: 'invoice-unmatched', invoice_number: 42, subtotal: 30, paid_at: '2026-10-02', campers: { lot_number: '10' } }],
    payouts: [{ id: 'po_failed', status: 'failed', amount: 12000, created: 1 }],
    disputes: [{ id: 'dp_1', amount: 7200, status: 'needs_response', created: 2, paymentIntent: 'pi_1' }],
    refunds: [{ id: 're_1', amount: 1800, status: 'pending', created: 3, paymentIntent: 'pi_1' }],
    referencedInvoices: [{ id: 'invoice-1', invoice_number: 40, payment_reference: 'pi_1', campers: { lot_number: '8' } }],
  })
  assert.equal(queue.length, 5)
  assert.equal(queue.find((item) => item.kind === 'dispute')?.href, '/admin/invoices/invoice-1')
  assert.equal(queue.find((item) => item.kind === 'refund')?.severity, 'watch')
  assert.equal(queue.find((item) => item.kind === 'late-ach')?.amountCents, 7200)
  assert.equal(queue.find((item) => item.kind === 'unmatched')?.href, '/admin/invoices/invoice-unmatched')
})

test('an ordinary new pending refund is not called stuck', () => {
  const queue = buildMoneyExceptionQueue({ refunds: [{ id: 'recent', status: 'pending', created: Math.floor(Date.now() / 1000) }] })
  assert.equal(queue.length, 0)
})

test('payment alerts retain their exact local repair link', () => {
  const [item] = buildMoneyExceptionQueue({ alerts: [{ id: 'a1', title: 'Duplicate payment', source_table: 'invoices', source_id: 'i1' }] })
  assert.equal(item.href, '/admin/invoices/i1')
  assert.equal(item.severity, 'urgent')
})

test('money exceptions safely accept Supabase relationship arrays', () => {
  const [item] = buildMoneyExceptionQueue({
    lateAchInvoices: [{ id: 'invoice-array', total_due: 12, campers: [{ lot_number: 'A7' }] }],
  })
  assert.equal(item.lotNumber, 'A7')
  assert.match(item.detail, /Lot A7/)
})
