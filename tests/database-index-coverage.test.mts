import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(
  new URL('../migrations/083_add_high_value_foreign_key_indexes.sql', import.meta.url),
  'utf8',
)

test('high-value foreign-key indexes cover the production query patterns', () => {
  for (const definition of [
    'invoice_items_invoice_id_idx\\s+ON public\\.invoice_items \\(invoice_id\\)',
    'admin_notifications_camper_type_idx\\s+ON public\\.admin_notifications \\(camper_id, type\\)',
    'meter_reading_submissions_camper_idx\\s+ON public\\.meter_reading_submissions \\(camper_id, captured_at DESC\\)',
    'meter_reading_submissions_invoice_id_idx\\s+ON public\\.meter_reading_submissions \\(invoice_id\\)',
  ]) {
    assert.match(migration, new RegExp(definition))
  }

  assert.match(migration, /WHERE invoice_id IS NOT NULL/)
})

test('index migration is idempotent, validates its result, and does not alter rows', () => {
  assert.equal((migration.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length, 4)
  assert.match(migration, /index_metadata\.indisvalid/)
  assert.match(migration, /index_metadata\.indisready/)
  assert.match(migration, /RAISE EXCEPTION 'Expected valid index % is missing\.'/)
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
})
