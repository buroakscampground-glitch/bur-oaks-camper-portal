import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('admin money watch keeps electric balances separate and opens their exact invoice list', () => {
  const adminHome = source('../app/admin/page.tsx')
  const invoices = source('../app/admin/invoices/page.tsx')
  const styles = source('../app/globals.css')

  assert.match(adminHome, /const electricOwedInvoices = openInvoices\.filter/)
  assert.match(adminHome, /electricOwedAmount: totalInvoiceBalance\(electricOwedInvoices\)/)
  assert.match(adminHome, /electricBilledAmount: electricCollection\.billed/)
  assert.match(adminHome, />Electric still owed</)
  assert.match(adminHome, /remaining out of \$\{stats\.electricBilledAmount\.toFixed\(2\)\} total billed/)
  assert.match(adminHome, /\/admin\/invoices\?filter=open&search=electric/)
  assert.match(adminHome, /electricLateCampers/)
  assert.match(invoices, /searchParams\.get\('search'\)/)
  assert.match(styles, /admin-money-watch-grid \.electric-owed/)
})
