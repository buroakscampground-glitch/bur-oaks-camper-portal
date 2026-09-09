import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('camper invoice detail updates immediately after an office balance change', async () => {
  const source = await readFile(new URL('../app/invoices/[id]/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /postgres_changes/)
  assert.match(source, /table: 'invoices'/)
  assert.match(source, /filter: `id=eq\.\$\{invoiceId\}`/)
  assert.match(source, /setInterval\(refreshInvoiceStatus, 5_000\)/)
  assert.match(source, /cache: 'no-store'/)
})

test('camper invoice list stays synchronized with invoice changes', async () => {
  const source = await readFile(new URL('../app/invoices/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /postgres_changes/)
  assert.match(source, /filter: `camper_id=eq\.\$\{camper\.id\}`/)
  assert.match(source, /setInterval\(refreshInvoiceStatuses, 5_000\)/)
})
