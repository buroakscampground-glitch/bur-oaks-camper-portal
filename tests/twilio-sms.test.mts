import assert from 'node:assert/strict'
import test from 'node:test'
import { isTwilioUnsubscribeError } from '../lib/twilio-sms.ts'

test('Twilio permanent opt-outs are recognized by provider code and message', () => {
  assert.equal(isTwilioUnsubscribeError(21610, 'The message From/To pair violates a blacklist rule.'), true)
  assert.equal(isTwilioUnsubscribeError(undefined, 'Attempt to send to unsubscribed recipient'), true)
  assert.equal(isTwilioUnsubscribeError(undefined, 'Recipient has opted out of messages'), true)
})

test('ordinary delivery failures do not change camper consent', () => {
  assert.equal(isTwilioUnsubscribeError(21211, 'The To number is not a valid phone number.'), false)
  assert.equal(isTwilioUnsubscribeError(undefined, 'Twilio is temporarily unavailable.'), false)
})
