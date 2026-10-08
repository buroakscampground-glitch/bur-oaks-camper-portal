import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('remaining payment reconciliation and alert clients use explicit Supabase contracts', async () => {
  const files = await Promise.all([
    read('lib/stripe-ach-reconciliation.ts'),
    read('lib/payment-alerts.ts'),
    read('lib/stripe-payout-alerts.ts'),
    read('lib/stripe-payout-reconciliation.ts'),
    read('lib/payment-fees.ts'),
  ])

  for (const source of files) {
    assert.match(source, /SupabaseClient/)
    assert.doesNotMatch(source, /admin:\s*any|client:\s*any/)
  }
})

test('Stripe payout matching normalizes provider sources and joined camper rows', async () => {
  const source = await read('lib/stripe-payout-reconciliation.ts')
  assert.match(source, /type PayoutTransactionSource =/)
  assert.match(source, /type PayoutInvoiceRow =/)
  assert.match(source, /function normalizedCamper\(invoice: PayoutInvoiceRow\)/)
  assert.doesNotMatch(source, /as any|source: any|Map<string, any/)
})

test('ACH reconciliation normalizes database rows and unknown provider failures once', async () => {
  const source = await read('lib/stripe-ach-reconciliation.ts')
  assert.match(source, /type ProcessingAchInvoice =/)
  assert.match(source, /const invoiceRows = \(invoices \|\| \[\]\) as ProcessingAchInvoice\[\]/)
  assert.match(source, /catch \(paymentError: unknown\)/)
  assert.match(source, /paymentError instanceof Error/)
})

test('automated invoice delivery and the payment register use typed database boundaries', async () => {
  const files = await Promise.all([
    read('lib/camper-sms.ts'),
    read('lib/invoice-texting.ts'),
    read('lib/invoice-emailing.ts'),
    read('lib/daily-payment-report.ts'),
  ])

  for (const source of files) {
    assert.match(source, /SupabaseClient/)
    assert.doesNotMatch(source, /client:\s*any/)
  }
  assert.doesNotMatch(files[1], /invoice:\s*any|camper:\s*any|contactProfiles:\s*any/)
  assert.doesNotMatch(files[2], /invoice:\s*any|items:\s*any|contactProfiles:\s*any|row:\s*any/)
  assert.doesNotMatch(files[3], /payment:\s*any|allocation:\s*any/)
  assert.match(files[3], /oneRelationship/)
})

test('renewal signatures, rent continuation, reconciliation, and reminders use typed boundaries', async () => {
  const files = await Promise.all([
    read('lib/renewal-rent-schedule-service.ts'),
    read('lib/renewal-document-reconciliation.ts'),
    read('lib/signed-renewal-document.ts'),
    read('lib/document-reminders.ts'),
  ])

  for (const source of files) {
    assert.match(source, /SupabaseClient/)
    assert.doesNotMatch(source, /client:\s*any/)
  }
  assert.doesNotMatch(files[1], /renewal:\s*any|document:\s*any/)
  assert.doesNotMatch(files[3], /profiles:\s*any|document:\s*any|camper:\s*any|row:\s*any/)
})

test('meter capture, labels, and monthly billing use typed database and request boundaries', async () => {
  const files = await Promise.all([
    read('app/api/meter-readings/route.ts'),
    read('app/api/meter-labels/route.ts'),
    read('lib/meter-billing-checklist.ts'),
  ])

  assert.match(files[0], /type AuthenticatedContext =/)
  assert.match(files[0], /function requestObject\(value: unknown\)/)
  assert.match(files[1], /type AuthenticatedContext =/)
  assert.match(files[2], /type MeterBillingChecklistInput =/)
  for (const source of files) assert.doesNotMatch(source, /\bany\b/)
})
