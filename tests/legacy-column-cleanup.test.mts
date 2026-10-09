import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../migrations/20261009002619_remove_empty_legacy_columns.sql', import.meta.url)
const baselineUrl = new URL('../database/baseline/000_public_schema.sql', import.meta.url)

test('legacy-column cleanup blocks itself if either supposedly empty field contains data', async () => {
  const migration = await readFile(migrationUrl, 'utf8')
  const invoiceGuard = migration.indexOf('invoices WHERE "21" IS NOT NULL')
  const rateGuard = migration.indexOf('electric_readings WHERE "Rate" IS NOT NULL')
  const invoiceDrop = migration.indexOf('invoices DROP COLUMN IF EXISTS "21"')
  const rateDrop = migration.indexOf('electric_readings DROP COLUMN IF EXISTS "Rate"')
  assert.ok(invoiceGuard >= 0 && invoiceGuard < invoiceDrop)
  assert.ok(rateGuard >= 0 && rateGuard < rateDrop)
  assert.match(migration, /RAISE EXCEPTION 'Blocked: invoices\."21" contains data\.'/)
  assert.match(migration, /RAISE EXCEPTION 'Blocked: electric_readings\."Rate" contains data\.'/)
  assert.doesNotMatch(migration, /\b(delete from|truncate|update|insert into)\b/i)
})

test('the reviewed baseline no longer recreates the unused columns or foreign key', async () => {
  const baseline = await readFile(baselineUrl, 'utf8')
  assert.doesNotMatch(baseline, /"Rate" numeric\(10,2\)/)
  assert.doesNotMatch(baseline, /"21" uuid/)
  assert.doesNotMatch(baseline, /invoices_21_fkey/)
})
