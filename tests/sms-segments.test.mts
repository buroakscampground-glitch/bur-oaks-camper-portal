import assert from 'node:assert/strict'
import test from 'node:test'
import {
  campgroundUpdateSms,
  gsm7Units,
  normalizeGsmSms,
  SMS_SINGLE_SEGMENT_LIMIT,
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

test('campground bulletin alerts are relevant one-segment links, not solicitation copy', () => {
  const text = campgroundUpdateSms(
    'Labor Day weekend schedule and clubhouse activities',
    'https://www.buroakscampground.com/updates'
  )

  assert.ok(gsm7Units(text) <= SMS_SINGLE_SEGMENT_LIMIT)
  assert.match(text, /^Bur Oaks account: CAMPGROUND UPDATE - Labor Day weekend schedule/)
  assert.match(text, /Details: https:\/\/www\.buroakscampground\.com\/updates/)
  assert.match(text, /Reply STOP to opt out\.$/)
})
