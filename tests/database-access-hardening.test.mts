import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../migrations/081_remove_legacy_public_database_access.sql', import.meta.url),
  'utf8',
)

test('legacy globally permissive camper policies are removed', () => {
  for (const policy of [
    'campers_admin_update',
    'campers_delete_policy',
    'campers_insert_policy',
    'campers_select_own_profile',
    'campers_update_own_profile',
  ]) {
    assert.match(migration, new RegExp(`DROP POLICY IF EXISTS ${policy} ON public\\.campers;`))
  }
})

test('anonymous SECURITY DEFINER access is revoked and asserted', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /has_function_privilege\('anon', p\.oid, 'EXECUTE'\)/)
  assert.match(migration, /RAISE EXCEPTION 'Anonymous SECURITY DEFINER execution remains\.'/)
})

test('required authenticated entry points are restored explicitly', () => {
  for (const functionName of [
    'current_camper_id',
    'is_admin_user',
    'is_maintenance_user',
    'get_camper_directory',
    'next_manual_invoice_number',
    'apply_account_credits_to_invoice_atomic',
    'create_invoice_bundle_atomic',
    'delete_invoice_with_credit_restore_atomic',
    'update_invoice_bundle_atomic',
  ]) {
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${functionName}\\(`))
  }
})
