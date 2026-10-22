import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('authorized billing returns current credit balances without exposing other portal data', () => {
  const source = read('app/api/authorized-billing/route.ts')

  assert.match(source, /from\('account_credits'\)/)
  assert.match(source, /\.eq\('status', 'active'\)/)
  assert.match(source, /\.gt\('remaining_amount', 0\)/)
  assert.match(source, /accountCredit:/)
  assert.match(source, /accountCreditDetails:/)
  assert.match(source, /'Cache-Control': 'no-store'/)
})

test('camper billing combines every authorized site and explains credits, payments, and due dates', () => {
  const source = read('app/invoices/page.tsx')

  assert.match(source, /ALL BILLING ON THIS LOGIN/)
  assert.match(source, /Lots \{billingLotLabel\}, together/)
  assert.match(source, /Credits applied/)
  assert.match(source, /Office payments/)
  assert.match(source, /Latest payment/)
  assert.match(source, /Next due/)
  assert.match(source, /Due \{formatDate\(invoice\.due_date\)\}/)
  assert.match(source, /All sites open balance/)
})
