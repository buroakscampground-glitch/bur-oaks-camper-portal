import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { activeAccountPolicies, policiesForCamper } from '../lib/account-policies.ts'

const migrationUrl = new URL('../migrations/20261009000816_camper_account_policies.sql', import.meta.url)

test('account policies honor effective and expiration dates and exact camper identity', () => {
  const policies: any[] = [
    { id: 'current', policy_type: 'lot_rent_exempt', camper_id: 'camper-1', reason: 'Current exception.', effective_on: '2026-01-01', expires_on: '2026-12-31', active: true },
    { id: 'future', policy_type: 'lot_rent_exempt', camper_id: 'camper-1', reason: 'Future exception.', effective_on: '2027-01-01', active: true },
    { id: 'expired', policy_type: 'lot_rent_exempt', camper_id: 'camper-1', reason: 'Expired exception.', effective_on: '2025-01-01', expires_on: '2025-12-31', active: true },
    { id: 'inactive', policy_type: 'lot_rent_exempt', camper_id: 'camper-1', reason: 'Inactive exception.', effective_on: '2026-01-01', active: false },
  ]
  assert.deepEqual(activeAccountPolicies(policies, '2026-10-08').map((policy) => policy.id), ['current'])
  assert.deepEqual(policiesForCamper(policies, { id: 'camper-1', lot_number: '99' }, '2026-10-08').map((policy) => policy.id), ['current'])
  assert.deepEqual(policiesForCamper(policies, { id: 'camper-2', lot_number: '99' }, '2026-10-08'), [])
})

test('account policy storage is admin-readable, server-write-only, and append-only', async () => {
  const migration = await readFile(migrationUrl, 'utf8')
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /FOR SELECT TO authenticated USING \(\(SELECT public\.is_admin_user\(\)\)\)/)
  assert.match(migration, /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_camper_account_policy_atomic[\s\S]*TO service_role/)
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.set_camper_account_policy_atomic[\s\S]*TO authenticated/)
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.camper_account_policy_events/)
  assert.match(migration, /Existing camper and billing records are not changed/)
  assert.doesNotMatch(migration, /UPDATE public\.(campers|invoices|payments|invoice_items)/i)
  assert.doesNotMatch(migration, /DELETE FROM public\.(campers|invoices|payments|invoice_items)/i)
})
