import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const page = await readFile(new URL('../app/admin/invoices/[id]/page.tsx', import.meta.url), 'utf8')

test('admin invoice detail cannot remain stuck in its loading state', () => {
  assert.match(page, /withInvoiceLoadTimeout/)
  assert.match(page, /finally\s*{[\s\S]*setLoading\(false\)/)
  assert.match(page, /Invoice could not load/)
  assert.match(page, /Try again/)
})
