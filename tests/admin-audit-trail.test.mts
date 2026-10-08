import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const migration = source('migrations/087_admin_audit_events.sql')

test('office audit ledger is append-only and not client writable', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.admin_audit_events/)
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.admin_audit_events/)
  assert.match(migration, /Administrative audit events are append-only/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.admin_audit_events FROM anon, authenticated/)
  assert.doesNotMatch(migration, /GRANT INSERT ON TABLE public\.admin_audit_events TO authenticated/)
})

test('high-risk financial and camper actions require an audit reason inside atomic database functions', () => {
  for (const routine of [
    'record_manual_payment_audited',
    'remove_invoice_late_fee_audited',
    'delete_invoice_with_audit_atomic',
    'set_camper_active_audited',
    'create_account_credit_audited',
    'void_account_credit_audited',
  ]) assert.match(migration, new RegExp(`FUNCTION public\\.${routine}`))
  assert.match(migration, /char_length\(btrim\(coalesce\(p_reason/)
  assert.match(migration, /before_state jsonb NOT NULL/)
  assert.match(migration, /after_state jsonb NOT NULL/)
})

test('office screens route protected changes through audited server endpoints', () => {
  const combined = [
    source('app/admin/credits/page.tsx'),
    source('app/admin/campers/page.tsx'),
    source('app/admin/archived-campers/page.tsx'),
    source('app/admin/invoices/page.tsx'),
    source('app/admin/invoices/[id]/page.tsx'),
    source('app/admin/open-balance/[id]/page.tsx'),
  ].join('\n')
  assert.match(combined, /createAccountCreditAudited/)
  assert.match(combined, /voidAccountCreditAudited/)
  assert.match(combined, /setCamperActiveAudited/)
  assert.match(combined, /Reason \/ office note/)
  assert.match(combined, /permanent campsite history/)
  assert.doesNotMatch(source('app/admin/credits/page.tsx'), /from\('account_credits'\)\.insert/)
})

test('campsite history includes the immutable office changes', () => {
  const route = source('app/api/admin-site-history/route.ts')
  assert.match(route, /from\('admin_audit_events'\)/)
  assert.match(route, /type: 'Office change'/)
  assert.match(route, /auditedChanges: auditEvents\.length/)
})
