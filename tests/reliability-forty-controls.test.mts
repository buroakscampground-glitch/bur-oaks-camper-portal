import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const portal = read('app/portal/page.tsx')
const pumpOut = read('app/api/sewer-pump-out/route.ts')
const maintenancePage = read('app/maintenance/page.tsx')
const maintenanceApi = read('app/api/maintenance-request/route.ts')
const checkout = read('app/api/create-checkout-session/route.ts')
const webhook = read('app/api/stripe-webhook/route.ts')
const creditMigration = read('migrations/080_restricted_extra_payment_credits.sql')

const controls: Array<[string, () => void]> = [
  ['pump-out blocks a second tap synchronously', () => assert.match(portal, /if \(requestingPumpRef\.current\) return/)],
  ['pump-out locks before asynchronous work begins', () => assert.match(portal, /requestingPumpRef\.current = true\s+setRequestingPump\(true\)/)],
  ['pump-out always releases its submission lock', () => assert.match(portal, /finally \{\s+requestingPumpRef\.current = false\s+setRequestingPump\(false\)/)],
  ['pump-out explains an unknown network result without claiming failure', () => assert.match(portal, /could not confirm whether your pump-out request was saved/)],
  ['pump-out unknown-result copy tells campers to verify before retrying', () => assert.match(portal, /Check the pump-out status here before trying again/)],
  ['pump-out redirects an expired session to sign-in', () => assert.match(portal, /if \(!token\) \{\s+window\.location\.href = '\/login'/)],
  ['pump-out shows confirmed duplicate protection', () => assert.match(portal, /No duplicate charge was added/)],
  ['pump-out replaces a returned request instead of duplicating local state', () => assert.match(portal, /filter\(\(request\) => String\(request\.id\) !== String\(result\.request\.id\)\)/)],
  ['pump-out API rate limits repeated requests', () => assert.match(pumpOut, /checkRateLimit\(request, 'sewer-pump-out', 5, 10 \* 60_000\)/)],
  ['pump-out rate limits include retry guidance', () => assert.match(pumpOut, /'Retry-After': String\(rateLimit\.retryAfter\)/)],
  ['pump-out API requires an authenticated camper', () => assert.match(pumpOut, /Not authorized.*status: 401/s)],
  ['pump-out rejects service lots outside the account', () => assert.match(pumpOut, /not connected to your pump-out account.*status: 403/s)],
  ['pump-out verifies the authorized billing lot', () => assert.match(pumpOut, /billing account for that campsite could not be verified/)],
  ['pump-out creation and duplicate detection are atomic', () => assert.match(pumpOut, /rpc\('request_sewer_pump_out_atomic'/)],
  ['pump-out refuses an unverified write result', () => assert.match(pumpOut, /if \(!requestRow\?\.id\)/)],
  ['maintenance blocks a second tap synchronously', () => assert.match(maintenancePage, /if \(submittingRef\.current\) return/)],
  ['maintenance preserves uploaded evidence after an unknown result', () => assert.match(maintenancePage, /Keep the\s*\/\/ uploaded photos/)],
  ['maintenance explains an unknown result without claiming failure', () => assert.match(maintenancePage, /could not confirm whether your request was submitted/)],
  ['maintenance refreshes authoritative status after an unknown result', () => assert.match(maintenancePage, /submittingRef\.current = false\s+setSubmitting\(false\)\s+await loadPage\(\)/)],
  ['maintenance API rate limits repeated requests', () => assert.match(maintenanceApi, /checkRateLimit\(request, 'maintenance-request', 10, 10 \* 60_000\)/)],
  ['maintenance API requires authentication', () => assert.match(maintenanceApi, /Not authorized.*status: 401/s)],
  ['maintenance accepts only photos owned by the signed-in user', () => assert.match(maintenanceApi, /path\.startsWith\(`\$\{context\.user\.id\}\/`\)/)],
  ['maintenance caps title and description input sizes', () => {
    assert.match(maintenanceApi, /slice\(0, 120\)/)
    assert.match(maintenanceApi, /slice\(0, 5000\)/)
  }],
  ['maintenance finds identical requests in a short replay window', () => assert.match(maintenanceApi, /Date\.now\(\) - 30_000/)],
  ['maintenance returns the original ticket for a duplicate', () => assert.match(maintenanceApi, /duplicate: true,\s+ticketId: recentMatch\.id/)],
  ['checkout limits invoice count per transaction', () => assert.match(checkout, /requestedIds\.length === 0 \|\| requestedIds\.length > 20/)],
  ['checkout validates invoice ownership on the server', () => assert.match(checkout, /allowedCamperIds\.has\(String\(invoice\.camper_id\)\)/)],
  ['checkout rejects closed or already-paid invoices', () => assert.match(checkout, /already paid, canceled, or void/)],
  ['checkout rejects invoices with a payment already processing', () => assert.match(checkout, /Please do not pay again/)],
  ['checkout keeps each transaction to one campsite', () => assert.match(checkout, /invoiceCamperIds\.size !== 1/)],
  ['checkout caps extra payments at ten thousand dollars', () => assert.match(checkout, /extraPaymentCents > 1_000_000/)],
  ['checkout recalculates invoice totals from authoritative rows', () => assert.match(checkout, /invoices\.reduce\(\(sum, invoice\).*total_due/s)],
  ['checkout fingerprints the verified transaction', () => assert.match(checkout, /const checkoutFingerprint = createHash\('sha256'\)/)],
  ['checkout uses its fingerprint as the Stripe idempotency key', () => assert.match(checkout, /idempotencyKey: `invoice-checkout-\$\{checkoutFingerprint\}`/)],
  ['webhooks reject missing Stripe signatures', () => assert.match(webhook, /Missing Stripe signature.*status: 400/s)],
  ['webhooks cryptographically verify Stripe signatures', () => assert.match(webhook, /stripe\.webhooks\.constructEvent\(payload, signature, webhookSecret\)/)],
  ['webhooks ledger every Stripe event before handling it', () => assert.match(webhook, /from\('stripe_webhook_events'\)\s+\.insert\(\{ event_id: event\.id, event_type: event\.type \}\)/)],
  ['webhooks acknowledge replayed events without applying them twice', () => assert.match(webhook, /ledgerError\?\.code === '23505'.*duplicate: true/s)],
  ['webhooks verify received totals and camper ownership', () => assert.match(webhook, /expectedAmount \+ extraPaymentCents \+ processingFeeCents !== session\.amount_total[\s\S]*camperIds\.size !== 1/)],
  ['account credits are unique by payment reference and applied atomically when due', () => {
    assert.match(creditMigration, /account_credits_source_reference_unique/)
    assert.match(creditMigration, /pg_advisory_xact_lock/)
    assert.match(creditMigration, /invoice_row\.due_date > campground_today/)
  }],
]

assert.equal(controls.length, 40, 'This milestone must remain an exact forty-control contract.')

for (const [name, verify] of controls) test(name, verify)
