import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/admin/income-projection/page.tsx', import.meta.url), 'utf8')

test('income projection learns from paid dates and electric usage fields', () => {
  assert.match(source, /reading_date,kwh_used,amount_due/)
  assert.match(source, /status,paid_at/)
})

test('income projection refreshes from live payments and meter readings with a safety poll', () => {
  assert.match(source, /table: 'invoices'/)
  assert.match(source, /table: 'electric_readings'/)
  assert.match(source, /setInterval\(\(\) => loadProjectionData\(\), 30_000\)/)
  assert.match(source, /removeChannel\(liveChanges\)/)
})
