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
    assert.match(page, /Payment amount|Payment toward this invoice/)
    assert.match(page, /remainder/)
  }
  assert.match(invoices, /amountCents: Math\.round\(extraAmount \* 100\)/)
  assert.match(invoice, /amountCents: Math\.round\(extraPaymentAmount \* 100\)/)
  assert.match(checkout, /extra_payment_destination/)
  assert.match(checkout, /Extra payment — future lot rent only/)
  assert.match(checkout, /paymentSubtotalCents = invoicePaymentCents \+ extraPaymentCents/)
})

test('campers can safely pay down one invoice in installments', () => {
  const invoices = source('app/invoices/page.tsx')
  const invoice = source('app/invoices/[id]/page.tsx')
  const review = source('app/components/payment-review-dialog.tsx')
  const checkout = source('app/api/create-checkout-session/route.ts')
  const webhook = source('app/api/stripe-webhook/route.ts')
  const migration = source('migrations/20261107232043_camper_partial_invoice_payments.sql')

  assert.match(invoices, /Pay any amount toward one bill/)
  assert.match(invoice, /Pay any amount toward this bill/)
  assert.match(invoice, /min="0\.50"/)
  assert.match(review, /Balance after payment confirms/)
  assert.match(checkout, /invoicePaymentCents/)
  assert.match(checkout, /To make a partial payment, choose one invoice at a time/)
  assert.match(checkout, /partial_payment: partialPayment \? 'true' : 'false'/)
  assert.match(webhook, /record_online_invoice_payment_atomic/)
  assert.match(webhook, /paymentDetails\.invoicePaymentCents \+ extraPaymentCents \+ processingFeeCents/)
  assert.match(migration, /payment_reference text NOT NULL UNIQUE/)
  assert.match(migration, /FOR UPDATE/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.online_invoice_payments FROM anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO service_role/)
  assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO authenticated/)
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
