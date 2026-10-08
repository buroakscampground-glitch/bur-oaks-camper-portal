import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getOperationalControls, operationalControlEnabled, operationalFeatureEnabled } from '../lib/operational-feature-flags.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('operational controls preserve existing behavior unless explicitly paused', () => {
  assert.equal(operationalFeatureEnabled(undefined), true)
  assert.equal(operationalFeatureEnabled('true'), true)
  for (const value of ['false', 'FALSE', '0', 'off', 'disabled', 'paused']) assert.equal(operationalFeatureEnabled(value), false)
})

test('each high-risk action can be paused independently', () => {
  const environment = { BUR_OAKS_BILLING_CHECKOUT_ENABLED: 'false', BUR_OAKS_RENEWAL_DECISIONS_ENABLED: 'true', BUR_OAKS_MANUAL_TEXTS_ENABLED: 'off' }
  assert.equal(operationalControlEnabled('billingCheckout', environment), false)
  assert.equal(operationalControlEnabled('renewalDecisions', environment), true)
  assert.equal(operationalControlEnabled('manualTextBroadcasts', environment), false)
  assert.equal(getOperationalControls(environment).length, 3)
})

test('checkout pause is checked before invoices are read or Stripe is contacted', () => {
  const route = read('app/api/create-checkout-session/route.ts')
  const guard = route.indexOf("operationalControlEnabled('billingCheckout')")
  assert.ok(guard > route.indexOf('getAuthenticatedContext(request)'))
  assert.ok(guard < route.indexOf(".from('invoices')"))
  assert.ok(guard < route.indexOf('stripe.checkout.sessions.create'))
  assert.match(route, /Your invoice has not changed/)
})

test('renewal pause allows reconciliation but precedes every mutation', () => {
  const route = read('app/api/renewal-decision/route.ts')
  const guard = route.indexOf("operationalControlEnabled('renewalDecisions')")
  assert.ok(guard > route.indexOf('duplicate: true'))
  assert.ok(guard < route.indexOf(".update({"))
  assert.match(route, /Your prior decision has not changed/)
})

test('manual text pause occurs before campaigns, deliveries, or provider sends', () => {
  const route = read('app/api/text-alerts/route.ts')
  const post = route.indexOf('export async function POST')
  const guard = route.indexOf("operationalControlEnabled('manualTextBroadcasts')")
  assert.ok(guard > route.indexOf('validSmsBroadcastRequestId(requestId)', post))
  assert.ok(guard < route.indexOf(".from('sms_broadcasts')", post))
  assert.ok(guard < route.indexOf('sendTwilioSms', post))
  assert.match(route, /Nothing was sent/)
})

test('admins can see control status without seeing raw environment values', () => {
  const route = read('app/api/admin-operations/route.ts')
  const page = read('app/admin/system-health/page.tsx')
  assert.match(route, /operationalControls: getOperationalControls\(\)/)
  assert.match(page, /High-risk actions/)
  assert.match(page, /control\.enabled \? 'Available' : 'PAUSED'/)
  assert.doesNotMatch(page, /BUR_OAKS_/)
})
