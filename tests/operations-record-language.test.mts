import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const page = await readFile(new URL('../app/admin/system-health/page.tsx', import.meta.url), 'utf8')
const route = await readFile(new URL('../app/api/admin-operations/route.ts', import.meta.url), 'utf8')
const cron = await readFile(new URL('../app/api/cron/monthly-operations-backup/route.ts', import.meta.url), 'utf8')

test('the office summary never presents itself as a restorable database backup', () => {
  assert.match(page, /Download operations record/)
  assert.match(page, /not a restorable database backup/)
  assert.doesNotMatch(page, /Download monthly backup/)
  assert.match(route, /Bur Oaks monthly operations record/)
  assert.doesNotMatch(route, /monthly operations backup/)
})

test('the monthly reminder explains the operations record accurately', () => {
  assert.match(cron, /Download operations record/)
  assert.match(cron, /not a database backup/)
  assert.doesNotMatch(cron, /download backup/i)
})
