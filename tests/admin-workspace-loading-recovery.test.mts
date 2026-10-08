import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('office billing never presents failed reads as current zero totals', () => {
  const page = read('app/admin/invoices/page.tsx')
  assert.match(page, /if \(error\) throw error/)
  assert.match(page, /if \(camperResult\.error\) throw camperResult\.error/)
  assert.match(page, /finally \{\s*setLoading\(false\)/)
  assert.match(page, /No totals on this screen should be treated as current/)
  assert.match(page, /Billing is temporarily unavailable/)
})

test('System Health always leaves loading and refuses stale-looking totals after failure', () => {
  const page = read('app/admin/system-health/page.tsx')
  assert.match(page, /if \(!response\.ok \|\| !result\.snapshot\) throw/)
  assert.match(page, /setSnapshot\(null\)/)
  assert.match(page, /finally \{\s*setLoading\(false\)/)
  assert.match(page, /No totals below should be treated as current/)
  assert.match(page, /role="alert"/)
})
