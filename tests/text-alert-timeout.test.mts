import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('large camper text campaigns run in safe batches with enough time', async () => {
  const route = await readFile(new URL('../app/api/text-alerts/route.ts', import.meta.url), 'utf8')
  const page = await readFile(new URL('../app/admin/texts/page.tsx', import.meta.url), 'utf8')

  assert.match(route, /export const maxDuration = 300/)
  assert.match(route, /index \+= 12/)
  assert.match(route, /Promise\.all\(batch\.map\(deliverRecipient\)\)/)
  assert.match(route, /pending_count: pendingCount/)
  assert.match(page, /LATEST CAMPAIGN/)
  assert.match(page, /still processing/)
})
