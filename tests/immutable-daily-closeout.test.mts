import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildDailyCloseoutSnapshot, closeoutSnapshotsMatch, summarizeDailyCloseout } from '../lib/daily-closeout.ts'

const migration = await readFile(new URL('../migrations/20261008234708_immutable_daily_closeout.sql', import.meta.url), 'utf8')

test('immutable closeout migration is append-only, admin-readable, and server-write-only', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.daily_closeout_approvals/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /GRANT SELECT ON TABLE public\.daily_closeout_approvals TO authenticated/)
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL).*daily_closeout_approvals TO authenticated/i)
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.daily_closeout_approvals/)
  assert.match(migration, /immutable and append-only/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.approve_daily_closeout_atomic[^;]+FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.approve_daily_closeout_atomic[^;]+TO service_role/)
  assert.match(migration, /extensions\.digest\(convert_to\(p_source_snapshot::text, 'UTF8'\), 'sha256'\)/)
})

test('immutable closeout migration does not mutate any existing ledger row', () => {
  const beforeFunctions = migration.split('CREATE OR REPLACE FUNCTION')[0].replace(/--.*$/gm, '')
  assert.doesNotMatch(beforeFunctions, /\b(?:UPDATE\s+public\.|DELETE\s+FROM|TRUNCATE)\b/i)
  assert.doesNotMatch(migration, /(?:invoices|payments|manual_payments|account_credits|campers)\s+SET\b/i)
})

test('closeout snapshots are deterministic, source-specific, and ignore object key order', () => {
  const summary = summarizeDailyCloseout({
    invoices: [{ id: 'invoice-1', total_due: 45, payment_method: 'Online card', paid_at: '2026-10-08T18:00:00Z' }],
    payouts: [{ id: 'payout-1', amount: 4500, status: 'paid', arrivalDate: '2026-10-08T17:00:00Z' }],
  })
  const snapshot = buildDailyCloseoutSnapshot('2026-10-08', summary)
  assert.equal(snapshot.readyToClose, true)
  assert.deepEqual(snapshot.sources.invoices, [{ id: 'invoice-1', amount: 45, method: 'Online card', paidAt: '2026-10-08T18:00:00Z' }])
  assert.equal(closeoutSnapshotsMatch(snapshot, JSON.parse(JSON.stringify(snapshot))), true)
  assert.equal(closeoutSnapshotsMatch({ b: 2, a: 1 }, { a: 1, b: 2 }), true)
  assert.equal(closeoutSnapshotsMatch(snapshot, { ...snapshot, totals: { ...snapshot.totals, received: 46 } }), false)
})
