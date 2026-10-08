import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const detail = await readFile(new URL('../app/admin/invoices/[id]/page.tsx', import.meta.url), 'utf8')

test('admin invoice detail requests only columns that exist on production invoice items', () => {
  assert.match(detail, /\.from\('invoice_items'\)[\s\S]*?\.select\('id, invoice_id, description, quantity, unit_price, total'\)[\s\S]*?\.eq\('invoice_id', invoiceId\)/)
  assert.doesNotMatch(detail, /\.from\('invoice_items'\)[\s\S]{0,180}\.order\('created_at'/)
})

test('invoice loading failures never expose raw database schema errors to staff', () => {
  assert.match(detail, /console\.error\('Unable to load admin invoice detail:', error\)/)
  assert.match(detail, /setLoadError\('Invoice records could not be verified\. Please try again\.'\)/)
  assert.doesNotMatch(detail, /setLoadError\(error\?\.message/)
})
