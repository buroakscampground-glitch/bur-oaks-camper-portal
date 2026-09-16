import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCamperStanding } from '../lib/camper-standing.ts'

const camper = { id: 'camper-1', lot_number: '15', first_name: 'Sample', last_name: 'Camper' }
const today = '2026-09-16'

test('one isolated resolved late payment stays clear and is labeled as a likely one-off', () => {
  const row = buildCamperStanding({
    camper,
    today,
    invoices: [{ due_date: '2026-08-01', paid_at: '2026-08-02', status: 'paid', total_due: 100 }],
    notices: [],
    documents: [],
  })
  assert.equal(row.standing, 'clear')
  assert.equal(row.pattern, 'one-off')
  assert.equal(row.late12Months, 1)
})

test('two resolved incidents within 24 months become watch', () => {
  const row = buildCamperStanding({
    camper,
    today,
    invoices: [{ due_date: '2026-08-01', paid_at: '2026-08-02', status: 'paid', total_due: 100 }],
    notices: [{ created_at: '2026-04-01', status: 'Resolved', priority: 'Standard' }],
    documents: [],
  })
  assert.equal(row.standing, 'watch')
  assert.equal(row.late24Months + row.siteCare24Months, 2)
})

test('old resolved history remains visible but does not permanently lower standing', () => {
  const row = buildCamperStanding({
    camper,
    today,
    invoices: [{ due_date: '2023-08-01', paid_at: '2023-08-03', status: 'paid', total_due: 100 }],
    notices: [{ created_at: '2023-07-01', status: 'Resolved', priority: 'Standard' }],
    documents: [],
  })
  assert.equal(row.standing, 'clear')
  assert.equal(row.pattern, 'improving')
  assert.equal(row.lateLifetime, 1)
  assert.equal(row.siteCareLifetime, 1)
})

test('repeated recent issues need review', () => {
  const row = buildCamperStanding({
    camper,
    today,
    invoices: [
      { due_date: '2026-01-01', paid_at: '2026-01-03', status: 'paid', total_due: 100 },
      { due_date: '2026-03-01', paid_at: '2026-03-03', status: 'paid', total_due: 100 },
      { due_date: '2026-05-01', paid_at: '2026-05-03', status: 'paid', total_due: 100 },
    ],
    notices: [],
    documents: [],
  })
  assert.equal(row.standing, 'needs-review')
  assert.equal(row.pattern, 'repeated')
})

test('a single current invoice needs review only after a reasonable grace period', () => {
  const recent = buildCamperStanding({ camper, today, invoices: [{ due_date: '2026-09-14', status: 'sent', total_due: 80 }], notices: [], documents: [] })
  const older = buildCamperStanding({ camper, today, invoices: [{ due_date: '2026-09-01', status: 'sent', total_due: 80 }], notices: [], documents: [] })
  assert.equal(recent.standing, 'watch')
  assert.equal(older.standing, 'needs-review')
})

test('a payment already processing never lowers camper standing', () => {
  const row = buildCamperStanding({ camper, today, invoices: [{ due_date: '2026-08-01', status: 'processing', total_due: 80 }], notices: [], documents: [] })
  assert.equal(row.standing, 'clear')
  assert.equal(row.pastDueInvoices, 0)
  assert.equal(row.lateLifetime, 0)
})
