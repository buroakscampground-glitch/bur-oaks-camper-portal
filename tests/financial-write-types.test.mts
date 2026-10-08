import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('critical payment and credit writes use a typed database client', () => {
  const credits = read('lib/account-credits.ts')
  const checkout = read('app/api/create-checkout-session/route.ts')

  assert.match(credits, /import type \{ SupabaseClient \}/)
  assert.doesNotMatch(credits, /client:\s*any/)
  assert.match(checkout, /let admin: SupabaseClient/)
  assert.doesNotMatch(checkout, /let admin:\s*any/)
})

test('authorized billing records stay typed through delegate selection', () => {
  const source = read('lib/authorized-billing.ts')

  assert.match(source, /AuthCamperRecord\[\]/)
  assert.match(source, /client: SupabaseClient/)
  assert.doesNotMatch(source, /campers:\s*any\[\]/)
  assert.doesNotMatch(source, /\(camper:\s*any\)/)
})

test('camper receipts use typed ledger records and database access', () => {
  const source = read('lib/camper-payment-receipt.ts')

  assert.match(source, /admin: SupabaseClient/)
  assert.match(source, /ReceiptInvoiceRow/)
  assert.match(source, /ManualAllocationRow/)
  assert.doesNotMatch(source, /invoice:\s*any/)
  assert.doesNotMatch(source, /PromiseLike<any>/)
  assert.doesNotMatch(source, /\(row:\s*any\)/)
})
