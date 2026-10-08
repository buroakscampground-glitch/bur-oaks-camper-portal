import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import test from 'node:test'

const cronRoot = new URL('../app/api/cron/', import.meta.url)
const guardSource = readFileSync(new URL('../lib/cron-failure-alert.ts', import.meta.url), 'utf8')

test('the cron failure guard alerts only on server failures and preserves the response', () => {
  assert.match(guardSource, /if \(response\.status >= 500\) await alertExternalFailure\('scheduled operation'/)
  assert.match(guardSource, /return response/)
  assert.match(guardSource, /catch \(error\) \{\s*await alertExternalFailure\('scheduled operation', jobName, request, 500\)\s*throw error/)
})

test('every scheduled route is guarded directly or delegates to a guarded route', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const scheduledPaths = new Set(config.crons.map((cron: any) => cron.path))

  for (const path of scheduledPaths) {
    const source = readFileSync(new URL(`../app${path}/route.ts`, import.meta.url), 'utf8')
    const guarded = source.includes('withCronFailureAlert(')
    const delegates = /import \{ GET as run[A-Za-z]+ \} from '\.\.\//.test(source)
    assert.ok(guarded || delegates, `${path} must use the cron failure guard or delegate to a guarded route`)
  }

  assert.ok(readdirSync(cronRoot).length >= scheduledPaths.size)
})

test('external failure alerts contain no response body or camper data', () => {
  assert.doesNotMatch(guardSource, /response\.json|response\.text|camper_id|invoice_id|payment/)
  assert.match(guardSource, /Request reference/)
  assert.match(guardSource, /system_failure/)
  assert.match(guardSource, /admin\/system-health#delivery/)
})

test('Stripe alerts only after cryptographic verification reaches a server failure', () => {
  const webhook = readFileSync(new URL('../app/api/stripe-webhook/route.ts', import.meta.url), 'utf8')
  const postAt = webhook.indexOf('export async function POST')
  const verifiedAt = webhook.indexOf('stripe.webhooks.constructEvent(payload, signature, webhookSecret)')
  const ledgerAlertAt = webhook.indexOf("alertStripeWebhookFailure('stripe-webhook-ledger'")
  const processingAlertAt = webhook.indexOf("alertStripeWebhookFailure('stripe-webhook-processing'")
  assert.ok(postAt >= 0 && verifiedAt > postAt && ledgerAlertAt > verifiedAt && processingAlertAt > verifiedAt)
  assert.doesNotMatch(webhook.slice(postAt, verifiedAt), /alertStripeWebhookFailure/)
})

test('Twilio and tawk alerts cannot run before provider signature verification', () => {
  const twilio = readFileSync(new URL('../app/api/twilio/inbound/route.ts', import.meta.url), 'utf8')
  const twilioPostAt = twilio.indexOf('export async function POST')
  const twilioVerifiedAt = twilio.indexOf('if (!validTwilioSignature')
  const twilioAlertAt = twilio.indexOf("alertVerifiedWebhookFailure('twilio-")
  assert.ok(twilioPostAt >= 0 && twilioVerifiedAt > twilioPostAt && twilioAlertAt > twilioVerifiedAt)
  assert.doesNotMatch(twilio.slice(twilioPostAt, twilioVerifiedAt), /alertVerifiedWebhookFailure/)
  for (const operation of [
    'twilio-consent-account-lookup',
    'twilio-consent-ledger',
    'twilio-consent-household-check',
    'twilio-consent-profile-sync',
    'twilio-consent-event-ledger',
  ]) assert.match(twilio, new RegExp(`alertVerifiedWebhookFailure\\('${operation}'`))
  assert.match(twilio, /if \(campersError\)[\s\S]*status: 500/)
  assert.match(twilio, /if \(camperUpdateError\)[\s\S]*status: 500/)
  assert.match(twilio, /if \(logError[\s\S]*status: 500/)

  const tawk = readFileSync(new URL('../app/api/tawk-chat-alert/route.ts', import.meta.url), 'utf8')
  const tawkPostAt = tawk.indexOf('export async function POST')
  const tawkVerifiedAt = tawk.indexOf('if (!signatureMatches')
  const tawkAlertAt = tawk.indexOf("alertVerifiedWebhookFailure('tawk-")
  assert.ok(tawkPostAt >= 0 && tawkVerifiedAt > tawkPostAt && tawkAlertAt > tawkVerifiedAt)
  assert.doesNotMatch(tawk.slice(tawkPostAt, tawkVerifiedAt), /alertVerifiedWebhookFailure/)
  for (const operation of ['tawk-chat-configuration', 'tawk-chat-event-ledger', 'tawk-chat-text-delivery']) {
    assert.match(tawk, new RegExp(`alertVerifiedWebhookFailure\\('${operation}'`))
  }
})
