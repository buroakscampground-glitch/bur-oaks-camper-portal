import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { summarizeSeasonOperations } from '../lib/season-operations.ts'

const camper = { id: 'camper-1', first_name: 'Season', last_name: 'Camper', lot_number: '42' }

test('season opening is ready only when system evidence and staff handoffs are complete', () => {
  const summary = summarizeSeasonOperations({ camper, seasonYear: 2026, phase: 'opening', now: new Date('2026-04-01T18:00:00Z'), renewal: { id: 'r1', contract_start_date: '2026-01-01', contract_end_date: '2026-12-31' }, documents: [{ document_name: 'Agreement', signature_status: 'signed' }, { document_name: 'Insurance' }], gateCards: [{ status: 'active' }], readings: [{ reading_date: '2026-03-20' }], invoices: [], manualTasks: [{ task_key: 'opening_site_inspection', completed_at: '2026-03-20' }, { task_key: 'opening_utilities_ready', completed_at: '2026-03-20' }] })
  assert.equal(summary.ready, true)
  assert.equal(summary.completed, 9)
})

test('season closing shows exact financial, meter, maintenance, and renewal exceptions', () => {
  const summary = summarizeSeasonOperations({ camper, seasonYear: 2026, phase: 'closing', now: new Date('2026-10-08T18:00:00Z'), renewal: { id: 'r1', status: 'Not Started' }, invoices: [{ due_date: '2026-10-01', total_due: 125, status: 'sent' }], readings: [{ reading_date: '2026-04-01' }], maintenance: [{ status: 'Open' }], manualTasks: [] })
  assert.equal(summary.ready, false)
  assert.equal(summary.tasks.find((task) => task.key === 'meter')?.complete, false)
  assert.match(summary.tasks.find((task) => task.key === 'balance')?.detail || '', /1 season invoice/)
  assert.match(summary.tasks.find((task) => task.key === 'maintenance')?.detail || '', /1 ticket/)
  assert.equal(summary.tasks.find((task) => task.key === 'renewal')?.complete, false)
})

test('season storage is Admin-readable, browser-read-only, and server-written atomically', async () => {
  const migration = await readFile(new URL('../migrations/20261008232954_season_operations.sql', import.meta.url), 'utf8')
  const route = await readFile(new URL('../app/api/admin-season-operations/route.ts', import.meta.url), 'utf8')
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g)
  assert.match(migration, /GRANT SELECT ON TABLE public\.season_operation_tasks, public\.season_operation_events TO authenticated/)
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL).*season_operation_(?:tasks|events).*authenticated/i)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.set_season_operation_task_atomic[^;]+FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_season_operation_task_atomic[^;]+TO service_role/)
  assert.match(route, /context\.admin\.rpc\('set_season_operation_task_atomic'/)
  assert.match(route, /Add a short staff note/)
})
