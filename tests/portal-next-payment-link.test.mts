import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const portalPage = await readFile(new URL('../app/portal/page.tsx', import.meta.url), 'utf8')
const invoiceDetailPage = await readFile(new URL('../app/invoices/[id]/page.tsx', import.meta.url), 'utf8')

test('the portal next-payment card opens the exact payable invoice', () => {
  assert.match(portalPage, /const nextPaymentHref = nextOwnedOpenInvoice\?\.id/)
  assert.match(portalPage, /`\/invoices\/\$\{encodeURIComponent\(String\(nextOwnedOpenInvoice\.id\)\)\}`/)
  assert.match(portalPage, /<a href=\{nextPaymentHref\}>[\s\S]*?<small>Next payment<\/small>/)
  assert.match(invoiceDetailPage, /Pay by ACH/)
  assert.match(invoiceDetailPage, /Pay by card/)
})
