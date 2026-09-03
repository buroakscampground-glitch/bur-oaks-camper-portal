import assert from 'node:assert/strict'
import test from 'node:test'
import {
  gsm7Units,
  normalizeGsmSms,
  singleSegmentSms,
} from '../lib/sms-segments.ts'

test('automated SMS copy stays inside one GSM-7 segment', () => {
  const message = singleSegmentSms({
    message: 'DOCUMENT NEEDS SIGNED - 2026 Renewal Form for Docusign, Lot FF2.',
    url: 'https://www.buroakscampground.com/documents',
    action: 'Sign',
  })

  assert.ok(gsm7Units(message) <= 160)
  assert.match(message, /^Bur Oaks account: DOCUMENT NEEDS SIGNED/)
  assert.match(message, /Sign: https:\/\/www\.buroakscampground\.com\/documents/)
  assert.match(message, /Reply STOP to opt out\.$/)
})

test('Unicode punctuation and emoji cannot silently multiply SMS segments', () => {
  const message = singleSegmentSms({
    message: 'Reminder — “please sign” ⚠️ ' + 'important '.repeat(30),
    url: 'https://www.buroakscampground.com/documents',
    action: 'Sign',
  })

  assert.equal(normalizeGsmSms(message), message)
  assert.ok(gsm7Units(message) <= 160)
  assert.match(message, /Reminder - "please sign"/)
  assert.match(message, /Reply STOP to opt out\.$/)
})
