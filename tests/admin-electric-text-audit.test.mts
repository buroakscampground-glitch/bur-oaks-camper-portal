import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('electric reminder audit verifies the expected stage with Twilio', async () => {
  const route = await readFile(new URL('../app/api/admin-electric-text-audit/route.ts', import.meta.url), 'utf8')
  const page = await readFile(new URL('../app/admin/system-health/page.tsx', import.meta.url), 'utf8')

  assert.match(route, /String\(invoice\.invoice_type \|\| ''\)\.toLowerCase\(\)\.includes\('electric'\)/)
  assert.match(route, /Messages\/\$\{encodeURIComponent\(messageId\)\}\.json/)
  assert.match(route, /provider === 'delivered'/)
  assert.match(route, /status === 'missing'/)
  assert.match(route, /No opted-in phone is available for this invoice/)
  assert.match(page, /Verify electric texts/)
  assert.match(page, /Checked against Twilio/)
})
