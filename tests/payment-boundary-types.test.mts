import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('remaining payment reconciliation and alert clients use explicit Supabase contracts', async () => {
  const files = await Promise.all([
    read('lib/stripe-ach-reconciliation.ts'),
    read('lib/payment-alerts.ts'),
    read('lib/stripe-payout-alerts.ts'),
    read('lib/payment-fees.ts'),
  ])

  for (const source of files) {
    assert.match(source, /SupabaseClient/)
    assert.doesNotMatch(source, /admin:\s*any|client:\s*any/)
  }
})

test('ACH reconciliation normalizes database rows and unknown provider failures once', async () => {
  const source = await read('lib/stripe-ach-reconciliation.ts')
  assert.match(source, /type ProcessingAchInvoice =/)
  assert.match(source, /const invoiceRows = \(invoices \|\| \[\]\) as ProcessingAchInvoice\[\]/)
  assert.match(source, /catch \(paymentError: unknown\)/)
  assert.match(source, /paymentError instanceof Error/)
})
