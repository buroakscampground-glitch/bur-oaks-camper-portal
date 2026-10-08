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

test('maintenance intake and Epson report paths use typed provider, request, and database boundaries', async () => {
  const files = await Promise.all([
    read('lib/admin-alert-email.ts'),
    read('lib/maintenance-work-order-report.ts'),
    read('lib/pump-out-report.ts'),
    read('app/api/maintenance-request/route.ts'),
    read('app/api/maintenance-staff-request/route.ts'),
    read('app/api/maintenance-completion-print/route.ts'),
    read('app/api/maintenance-work-order-report/route.ts'),
    read('app/api/maintenance-pump-outs/route.ts'),
  ])

  assert.match(files[0], /Promise<AdminAlertEmailResult>/)
  assert.match(files[1], /SupabaseClient/)
  assert.match(files[2], /SupabaseClient/)
  for (const source of files) assert.doesNotMatch(source, /\bany\b/)
})

test('event email, SMS, community email, and staff push deliveries use typed boundaries', async () => {
  const files = await Promise.all([
    read('lib/event-reminders.ts'),
    read('lib/community-notifications.ts'),
    read('lib/staff-web-push.ts'),
  ])

  assert.match(files[0], /client: SupabaseClient/)
  assert.match(files[0], /camper: AuthCamperRecord/)
  assert.match(files[1], /Promise<CommunityEmailResult>/)
  assert.match(files[2], /admin: SupabaseClient/)
  assert.match(files[2], /const users: User\[\]/)
  for (const source of files) assert.doesNotMatch(source, /\bany\b/)
})

test('Twilio consent propagation and camper celebrations use typed database boundaries', async () => {
  const files = await Promise.all([
    read('lib/twilio-sms.ts'),
    read('lib/camper-celebrations.ts'),
  ])

  for (const source of files) {
    assert.match(source, /SupabaseClient/)
    assert.doesNotMatch(source, /\bany\b/)
  }
  assert.match(files[0], /type TwilioResponse =/)
  assert.match(files[1], /camper: AuthCamperRecord/)
})

test('System Health uses typed rows and normalizes joined camper relationships', async () => {
  const [source, page, electricAudit] = await Promise.all([
    read('lib/operations-health.ts'),
    read('app/admin/system-health/page.tsx'),
    read('app/api/admin-electric-text-audit/route.ts'),
  ])
  assert.match(source, /client: SupabaseClient/)
  assert.match(source, /oneRelationship\(invoice\.campers\)/)
  assert.match(source, /oneRelationship\(document\.campers\)/)
  assert.match(page, /useState<SystemHealthSnapshot \| null>/)
  assert.match(electricAudit, /type ElectricAuditDraft =/)
  for (const file of [source, page, electricAudit]) assert.doesNotMatch(file, /\bany\b/)
})

test('invoice display, payment review, ACH, electric, and monthly report helpers use typed money boundaries', async () => {
  const files = await Promise.all([
    read('lib/ach-expected-date.ts'),
    read('lib/stripe-payment-review.ts'),
    read('lib/electric-payment-cycles.ts'),
    read('lib/electric-invoice-review.ts'),
    read('lib/monthly-billing-report.ts'),
    read('lib/invoice-display.ts'),
  ])

  assert.match(files[0], /type AchProcessingInvoice =/)
  assert.match(files[1], /type PriorPaymentInvoice =/)
  assert.match(files[2], /type ElectricCycleInvoice =/)
  assert.match(files[3], /type ElectricChargeReviewRow =/)
  assert.match(files[4], /type ReportInvoiceItem =/)
  assert.match(files[5], /type DisplayInvoiceItem =/)
  for (const source of files) assert.doesNotMatch(source, /\bany\b/)
})

test('shared billing settings, admin alerts, delivery summaries, and setup links use typed clients and results', async () => {
  const files = await Promise.all([
    read('lib/campground-settings.ts'),
    read('lib/admin-notifications.ts'),
    read('lib/admin-alert-actions.ts'),
    read('lib/client-invoice-texts.ts'),
    read('lib/portal-setup-link.ts'),
  ])

  assert.match(files[0], /client: SupabaseClient/)
  assert.match(files[1], /admin: SupabaseClient/)
  assert.match(files[2], /supabase: SupabaseClient/)
  assert.match(files[3], /type InvoiceDeliveryResult =/)
  assert.match(files[4], /admin: SupabaseClient/)
  for (const source of files) assert.doesNotMatch(source, /\bany\b/)
})
