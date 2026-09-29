import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('admins can create a standalone manual water invoice with a custom amount', async () => {
  const page = await readFile(new URL('../app/admin/invoices/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /'Manual Water Charge'/)
  assert.match(page, /<span>Amount<\/span>/)
})

test('electric billing accepts and itemizes a custom manual water amount', async () => {
  const page = await readFile(new URL('../app/admin/electric/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /Enter custom water amount/)
  assert.match(page, /aria-label="Manual water charge amount"/)
  assert.match(page, /customWaterCharge \? 'Manual Water Charge' : 'Water\/Trash Fee'/)
  assert.match(page, /manual water charge of at least \$0\.01/)
  assert.match(page, /manual-water.*standard-water-trash/)
})
