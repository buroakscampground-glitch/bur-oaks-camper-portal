import assert from 'node:assert/strict'
import test from 'node:test'
import { addYearsToDate, buildContinuedRentSchedule } from '../lib/renewal-rent-schedule.ts'

test('signed renewal carries the prior lot-rent schedule forward one year', () => {
  const schedule = buildContinuedRentSchedule([
    { id: 'may', invoice_type: 'Lot Rent', subtotal: 375, due_date: '2026-05-01', status: 'paid', created_at: '2026-04-01' },
    { id: 'aug', invoice_type: 'Lot Rent', subtotal: 375, due_date: '2026-08-01', status: 'paid', created_at: '2026-07-01' },
    { id: 'nov', invoice_type: 'Lot Rent', subtotal: 375, due_date: '2026-11-01', status: 'sent', created_at: '2026-10-01' },
    { id: 'feb', invoice_type: 'Lot Rent', subtotal: 375, due_date: '2027-02-01', status: 'sent', created_at: '2027-01-01' },
    { id: 'electric', invoice_type: 'Electric Bill', subtotal: 80, due_date: '2026-08-01', status: 'paid' },
    { id: 'old', invoice_type: 'Lot Rent', subtotal: 350, due_date: '2026-02-01', status: 'paid' },
  ], '2027-05-01')

  assert.deepEqual(schedule.map((installment) => [installment.sourceInvoiceId, installment.dueDate, installment.amount]), [
    ['may', '2027-05-01', 375],
    ['aug', '2027-08-01', 375],
    ['nov', '2027-11-01', 375],
    ['feb', '2028-02-01', 375],
  ])
})

test('renewal schedule preserves actual installments without copying late fees', () => {
  const schedule = buildContinuedRentSchedule([{
    id: 'split-rent',
    invoice_type: 'Seasonal Lot Rent',
    subtotal: 420,
    total_due: 504,
    late_fee: 84,
    due_date: '2026-07-25',
    status: 'sent',
    invoice_items: [{ description: 'Lot Rent', quantity: 1, unit_price: 420, total: 420 }],
  }], '2027-07-25')

  assert.equal(schedule.length, 1)
  assert.equal(schedule[0].dueDate, '2027-07-25')
  assert.equal(schedule[0].amount, 420)
  assert.equal(schedule[0].items[0].total, 420)
})

test('annual schedules and leap-day due dates carry forward safely', () => {
  assert.equal(addYearsToDate('2028-02-29', 1), '2029-02-28')
  const schedule = buildContinuedRentSchedule([
    { id: 'annual', invoice_type: 'Site Rent', subtotal: 1500, due_date: '2026-10-12', status: 'paid' },
  ], '2027-10-12')
  assert.deepEqual(schedule.map((installment) => installment.dueDate), ['2027-10-12'])
})
