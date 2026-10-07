import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../migrations/082_remove_exact_duplicate_admin_policies.sql', import.meta.url),
  'utf8',
)

test('policy cleanup requires every access expression to match exactly', () => {
  for (const comparison of [
    'specific.cmd = generic.cmd',
    'specific.roles = generic.roles',
    'specific.qual = generic.qual',
    'specific.with_check = generic.with_check',
  ]) {
    assert.match(migration, new RegExp(comparison.replaceAll('.', '\\.')))
  }
})

test('policy cleanup targets only the generic lockdown policy', () => {
  assert.match(migration, /generic\.policyname = 'admin_full_access_security_lockdown'/)
  assert.match(migration, /DROP POLICY %I ON public\.%I/)
  assert.doesNotMatch(migration, /DELETE\s+FROM|UPDATE\s+public\.|TRUNCATE/i)
})

test('policy cleanup asserts that no exact duplicate remains', () => {
  assert.match(migration, /RAISE EXCEPTION 'An exactly duplicated generic admin policy remains\.'/)
})
