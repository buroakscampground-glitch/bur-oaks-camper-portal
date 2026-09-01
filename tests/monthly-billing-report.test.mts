import assert from 'node:assert/strict'
import test from 'node:test'
import { futureOpenSchedule, monthlyDueSummary } from '../lib/monthly-billing-report.ts'

test('monthly report separates itemized charges and excludes future due months', () => {
  const invoices = [
    {
      id: 'sep-electric', status: 'open', due_date: '2026-09-20', total_due: 85,
      invoice_type: 'Electric + Water/Trash',
      invoice_items: [
        { description: 'Electric usage', total: 55 },
        { description: 'Water/Trash', total: 30 },
      ],
    },
    { id: 'sep-rent', status: 'paid', due_date: '2026-09-01', total_due: 400, invoice_type: 'Lot Rent' },
    { id: 'oct-rent', status: 'open', due_date: '2026-10-01', total_due: 400, invoice_type: 'Lot Rent' },
  ]

  const result = monthlyDueSummary(invoices, '2026-09')
  assert.equal(result.total, 485)
  assert.equal(result.paid, 400)
  assert.equal(result.open, 85)
  assert.deepEqual(result.categories.map((row) => [row.label, row.total]), [
    ['Electric', 55],
    ['Water / Trash', 30],
    ['Lot Rent', 400],
  ])
})

test('future open balances stay grouped in their actual due month', () => {
  const result = futureOpenSchedule([
    { status: 'open', due_date: '2026-09-30', total_due: 50 },
    { status: 'open', due_date: '2026-10-01', total_due: 100 },
    { status: 'open', due_date: '2026-10-20', total_due: 75 },
    { status: 'paid', due_date: '2026-11-01', total_due: 300 },
    { status: 'open', due_date: '2026-12-01', total_due: 250 },
  ], '2026-09')

  assert.deepEqual(result, [
    { month: '2026-10', count: 2, total: 175 },
    { month: '2026-12', count: 1, total: 250 },
  ])
})
