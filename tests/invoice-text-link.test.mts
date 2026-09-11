import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('automatic invoice texts link directly to the invoice payment screen', () => {
  const textingSource = readFileSync(new URL('../lib/invoice-texting.ts', import.meta.url), 'utf8')
  const invoiceSource = readFileSync(new URL('../app/invoices/[id]/page.tsx', import.meta.url), 'utf8')

  assert.match(textingSource, /portalSmsUrl\(`\/invoices\/\$\{encodeURIComponent\(String\(invoice\.id\)\)\}`\)/)
  assert.doesNotMatch(textingSource, /portalSmsUrl\('\/invoices'\)/)
  assert.match(invoiceSource, /\/login\?returnTo=\$\{encodeURIComponent\(returnTo\)\}/)
})
