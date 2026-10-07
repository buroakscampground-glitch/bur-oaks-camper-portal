import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('admin camper history returns credits and their exact invoice applications', () => {
  const route = source('app/api/admin-site-history/route.ts')

  assert.match(route, /from\('account_credits'\)/)
  assert.match(route, /from\('account_credit_applications'\)/)
  assert.match(route, /invoices\(id,invoice_number,invoice_type,due_date,status,total_due\)/)
  assert.match(route, /activeCreditBalance/)
  assert.match(route, /creditsApplied/)
  assert.match(route, /openLotRentBalance/)
  assert.match(route, /openOtherBalance/)
})

test('camper profile gives the office a dedicated credit ledger', () => {
  const profile = source('app/admin/campers/[id]/page.tsx')

  assert.match(profile, /label="Credits"/)
  assert.match(profile, /original credit/)
  assert.match(profile, /Applied to/)
  assert.match(profile, /application\.amount_applied/)
  assert.match(profile, /invoice\?\.invoice_number/)
  assert.match(profile, /Credits applied/)
  assert.match(profile, /Credit payment is recorded/)
  assert.match(profile, /already been applied to this camper’s invoices/)
  assert.match(profile, /See exactly where it went/)
  assert.match(profile, /lot rent ·/)
  assert.match(profile, /other charges/)
})

test('main credits page lists where every credit was applied', () => {
  const credits = source('app/admin/credits/page.tsx')

  assert.match(credits, /Where this credit went/)
  assert.match(credits, /applied to \{invoice\?\.invoice_type/)
  assert.match(credits, /\/admin\/invoices\/\$\{invoice\.id\}/)
})
