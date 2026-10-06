import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('camper checkout offers an explicit extra-payment destination', () => {
  const invoices = source('app/invoices/page.tsx')
  const invoice = source('app/invoices/[id]/page.tsx')
  const checkout = source('app/api/create-checkout-session/route.ts')

  for (const page of [invoices, invoice]) {
    assert.match(page, /Future lot rent only/)
    assert.match(page, /Any future bill/)
    assert.match(page, /Total payment amount/)
    assert.match(page, /remainder/)
  }
  assert.match(invoices, /amountCents: Math\.round\(extraAmount \* 100\)/)
  assert.match(invoice, /amountCents: Math\.round\(extraPaymentAmount \* 100\)/)
  assert.match(checkout, /extra_payment_destination/)
  assert.match(checkout, /Extra payment — future lot rent only/)
  assert.match(checkout, /paymentSubtotalCents = invoiceSubtotalCents \+ extraPaymentCents/)
})

test('successful extra payments become idempotent restricted credits', () => {
  const webhook = source('app/api/stripe-webhook/route.ts')
  const migration = source('migrations/080_restricted_extra_payment_credits.sql')

  assert.match(webhook, /sourceReference = `stripe-extra:\$\{paymentReference\}`/)
  assert.match(webhook, /applies_to: extra\.destination/)
  assert.match(webhook, /recordExtraPaymentCredit/)
  assert.match(migration, /CHECK \(applies_to IN \('general', 'lot_rent'\)\)/)
  assert.match(migration, /account_credits_source_reference_unique/)
  assert.match(migration, /COALESCE\(applies_to, 'general'\) = 'lot_rent' AND invoice_is_lot_rent/)
})
