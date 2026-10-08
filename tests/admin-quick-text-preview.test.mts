import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('bulk texts require a read-only exact recipient preview and server-side link review', async () => {
  const [component, route] = await Promise.all([
    readFile(new URL('../components/AdminQuickText.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/text-alerts/route.ts', import.meta.url), 'utf8'),
  ])

  assert.match(component, /preview: 'recipients'/)
  assert.match(component, /EXACT RECIPIENT PREVIEW/)
  assert.match(component, /FINAL PHONE PREVIEW/)
  assert.match(component, /LINK CHECK/)
  assert.match(component, /Review & send to/)
  assert.match(component, /recipientPreview\.recipientCount === 0/)
  assert.match(route, /url\.searchParams\.get\('preview'\) === 'recipients'/)
  assert.match(route, /planTextRecipients/)
  assert.match(route, /recipientCount: plan\.recipientPlan\.recipients\.length/)
  assert.match(route, /'Cache-Control': 'no-store'/)
  assert.match(route, /reviewSmsLinks\(message\)/)
  assert.match(route, /Remove insecure, shortened, or credential-bearing links/)
})
