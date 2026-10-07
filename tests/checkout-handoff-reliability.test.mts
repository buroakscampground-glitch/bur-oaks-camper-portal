import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('every invoice payment entry point blocks rapid duplicate checkout creation', () => {
  for (const path of ['app/invoices/page.tsx', 'app/invoices/[id]/page.tsx', 'app/final-invoice/[token]/page.tsx']) {
    const source = read(path)
    assert.match(source, /if \((checkoutRef|payingRef)\.current\) return/)
    assert.match(source, /(checkoutRef|payingRef)\.current = true/)
    assert.match(source, /(checkoutRef|payingRef)\.current = false/)
  }
})

test('checkout handoff errors are plain language and never expose raw response JSON', () => {
  const source = read('lib/stripe.ts')
  const route = read('app/api/create-checkout-session/route.ts')
  assert.doesNotMatch(source, /JSON\.stringify\(data/)
  assert.match(source, /repeated attempts reuse the same protected checkout/)
  assert.match(source, /typeof data\?\.error === 'string'/)
  assert.match(route, /checkoutFingerprint/)
  assert.match(route, /idempotencyKey: `invoice-checkout-\$\{checkoutFingerprint\}`/)
})

test('payment return pages tell campers to verify status before retrying', () => {
  const success = read('app/success/page.tsx')
  const cancel = read('app/cancel/page.tsx')
  assert.match(success, /source of truth/)
  assert.match(success, /please do not pay it again/)
  assert.match(cancel, /Check before retrying/)
  assert.match(cancel, /Retry only if Open/)
  assert.doesNotMatch(cancel, /Nothing changed/)
})
