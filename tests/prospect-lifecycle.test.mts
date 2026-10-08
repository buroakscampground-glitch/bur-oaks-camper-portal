import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL('../migrations/20261008224338_prospect_lifecycle.sql', import.meta.url), 'utf8')
const page = await readFile(new URL('../app/admin/waitlist/page.tsx', import.meta.url), 'utf8')
const activityRoute = await readFile(new URL('../app/api/admin-waitlist-activity/route.ts', import.meta.url), 'utf8')
const conversionRoute = await readFile(new URL('../app/api/admin-waitlist-convert/route.ts', import.meta.url), 'utf8')

test('prospect history is append-only in the browser and server writes are atomic', () => {
  assert.match(migration, /ALTER TABLE public\.waitlist_activities ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /GRANT SELECT ON TABLE public\.waitlist_activities TO authenticated/)
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL).*waitlist_activities TO authenticated/i)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.record_waitlist_activity_atomic[^;]+FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.record_waitlist_activity_atomic[^;]+TO service_role/)
  assert.match(activityRoute, /getAuthenticatedContext/)
  assert.match(activityRoute, /context\.admin\.rpc\('record_waitlist_activity_atomic'/)
  assert.match(conversionRoute, /p_activity_type: 'converted'/)
  assert.match(conversionRoute, /p_converted_camper_id: camper\.id/)
})

test('the main prospect queue preserves history instead of permanently deleting people', () => {
  assert.doesNotMatch(page, /from\('waitlist'\)\.delete\(/)
  assert.doesNotMatch(page, />Delete</)
  assert.match(page, /Their history will be kept/)
  assert.match(page, /waitlist_activities/)
  assert.match(page, /Next follow-up/)
})

test('the additive migration contains no existing-row mutation or row deletion', () => {
  const schemaChanges = migration.split('CREATE OR REPLACE FUNCTION')[0]
  assert.doesNotMatch(schemaChanges, /\bDELETE\s+FROM\b/i)
  assert.doesNotMatch(schemaChanges, /\bUPDATE\s+public\.waitlist\b/i)
  assert.doesNotMatch(schemaChanges, /\bTRUNCATE\b/i)
  assert.match(schemaChanges, /ADD COLUMN IF NOT EXISTS/)
})
