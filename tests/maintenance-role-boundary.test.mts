import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const camperEditor = await readFile(new URL('../app/admin/campers/[id]/page.tsx', import.meta.url), 'utf8')
const profileRoute = await readFile(new URL('../app/api/admin-camper-profile/route.ts', import.meta.url), 'utf8')
const migration = await readFile(new URL('../migrations/20261015154710_prevent_numbered_camper_maintenance_access.sql', import.meta.url), 'utf8')

test('normal campsite profiles cannot be assigned maintenance access in the office editor', () => {
  assert.match(camperEditor, /MAINTENANCE_STAFF_LOT/)
  assert.match(camperEditor, /Maintenance uses a separate STAFF account/)
  assert.match(profileRoute, /Maintenance access is limited to the dedicated STAFF account/)
})

test('the database restricts maintenance authorization to the dedicated staff identity', () => {
  assert.match(migration, /campers_maintenance_staff_lot_check/)
  assert.match(migration, /upper\(btrim\(coalesce\(lot_number, ''\)\)\) = 'STAFF'/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.is_maintenance_user\(\)/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.is_maintenance_user\(\) FROM PUBLIC/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.is_maintenance_user\(\) TO authenticated/)
})
