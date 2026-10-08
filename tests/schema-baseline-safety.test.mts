import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { analyzeSchemaBaseline } from '../scripts/audit-schema-baseline.mjs'

const exporter = await readFile(new URL('../scripts/export-schema-baseline.mjs', import.meta.url), 'utf8')
const stagingFixtures = await readFile(new URL('../database/staging/fixtures.sql', import.meta.url), 'utf8')
const productionBaseline = await readFile(new URL('../database/baseline/000_public_schema.sql', import.meta.url), 'utf8')

const safeSchema = `
CREATE TABLE public.campers (id uuid PRIMARY KEY);
ALTER TABLE public.campers ENABLE ROW LEVEL SECURITY;
CREATE POLICY campers_self ON public.campers USING (true);
CREATE INDEX campers_id_idx ON public.campers (id);
`

test('schema baseline audit accepts structure without records', () => {
  const report = analyzeSchemaBaseline(safeSchema)
  assert.equal(report.safeToReview, true)
  assert.equal(report.tables, 1)
  assert.equal(report.copyStatements, 0)
  assert.equal(report.rowInsertStatements, 0)
})

test('schema baseline audit blocks copied or inserted rows', () => {
  for (const unsafeSql of [
    `${safeSchema}\nCOPY public.campers (id) FROM stdin;\nabc\n\\.`,
    `${safeSchema}\nINSERT INTO public.campers (id) VALUES ('abc');`,
  ]) {
    const report = analyzeSchemaBaseline(unsafeSql)
    assert.equal(report.safeToReview, false)
    assert.ok(report.failures.some((failure) => failure.includes('table rows')))
  }
})

test('schema export fixes the production target and keeps credentials out of arguments', () => {
  assert.match(exporter, /postgres\.\$\{productionProjectRef\}@aws-1-us-west-1\.pooler\.supabase\.com/)
  assert.match(exporter, /PGPASSWORD: databasePassword/)
  assert.match(exporter, /BUR_OAKS_PG_DUMP_BINARY/)
  assert.match(exporter, /'--schema-only'/)
  assert.match(exporter, /'--no-owner'/)
  assert.doesNotMatch(exporter, /'--no-privileges'/)
  assert.match(exporter, /replaceAll\(databasePassword, '\[REDACTED_PASSWORD\]'\)/)
  assert.match(exporter, /--schema[\s\S]*'public'/)
  assert.doesNotMatch(exporter, /'--password'/)
  assert.doesNotMatch(exporter, /console\.log\(databasePassword\)/)
  assert.doesNotMatch(exporter, /'supabase@latest'/)
})

test('staging fixtures are guarded, fictional, and delivery inert', () => {
  assert.match(stagingFixtures, /key = 'environment' AND value = 'staging'/)
  assert.match(stagingFixtures, /RAISE EXCEPTION 'Blocked:/)
  assert.doesNotMatch(stagingFixtures, /INSERT INTO public\.app_settings/i)
  assert.doesNotMatch(stagingFixtures, /@[a-z0-9.-]+\.(com|net|org|gov|edu)\b/i)
  assert.doesNotMatch(stagingFixtures, /\+?1?[ (.-][2-9][0-9]{2}[ ).-][0-9]{3}[ .-][0-9]{4}/)
  assert.doesNotMatch(stagingFixtures, /sms_opt_in[^\n]*true/i)
  assert.match(stagingFixtures, /@staging\.buroaks\.invalid/g)
  assert.match(stagingFixtures, /TEST-01/g)
  assert.match(stagingFixtures, /ON CONFLICT \(id\) DO NOTHING/g)
  assert.match(stagingFixtures, /admin_approved, approved_at, approved_by/)
})

test('Admin-only financial RPCs are never granted to browser roles', () => {
  for (const functionName of [
    'create_account_credit_audited',
    'void_account_credit_audited',
    'delete_invoice_with_audit_atomic',
    'record_manual_payment_audited',
    'record_waitlist_activity_atomic',
    'remove_invoice_late_fee_audited',
    'set_camper_active_audited',
    'update_camper_profile_audited',
    'update_camper_rent_terms_audited',
  ]) {
    const browserGrant = new RegExp(`GRANT EXECUTE ON FUNCTION public\\."${functionName}"[^;]+ TO \\"(?:anon|authenticated)\\";`)
    assert.doesNotMatch(productionBaseline, browserGrant, `${functionName} must remain server-only`)
    assert.match(
      productionBaseline,
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\."${functionName}"[^;]+ FROM PUBLIC, \\"anon\\", \\"authenticated\\";`),
      `${functionName} must explicitly revoke PostgreSQL's default PUBLIC execute privilege`,
    )
    assert.match(productionBaseline, new RegExp(`GRANT EXECUTE ON FUNCTION public\\."${functionName}"[^;]+ TO \\"service_role\\";`))
  }
})
