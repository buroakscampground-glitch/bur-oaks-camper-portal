import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canConvertWaitlistStatus,
  cleanWaitlistConversionValue,
  NEW_CAMPER_ANNUAL_RENT,
  NEW_CAMPER_ASSOCIATION_FEE,
  waitlistWelcomeCopy,
} from '../lib/waitlist-conversion.ts'

test('active waitlist applicants can be converted while terminal records cannot', () => {
  assert.equal(canConvertWaitlistStatus('Waiting'), true)
  assert.equal(canConvertWaitlistStatus('Contacted'), true)
  assert.equal(canConvertWaitlistStatus('Accepted'), true)
  assert.equal(canConvertWaitlistStatus('Converted'), false)
  assert.equal(canConvertWaitlistStatus('Removed'), false)
  assert.equal(canConvertWaitlistStatus('Declined'), false)
})

test('welcome copy names the new camper and assigned campsite', () => {
  const copy = waitlistWelcomeCopy('Sally', '42')
  assert.match(copy.subject, /Welcome to the Bur Oaks family/)
  assert.match(copy.heading, /Welcome to the Bur Oaks family/)
  assert.match(copy.message, /welcome you to Bur Oaks Campground/)
  assert.match(copy.message, /Site 42/)
  assert.match(copy.message, /Camper Portal/)
})

test('conversion values are trimmed and length-limited', () => {
  assert.equal(cleanWaitlistConversionValue('  Site 7  ', 20), 'Site 7')
  assert.equal(cleanWaitlistConversionValue('abcdefgh', 4), 'abcd')
})

test('new waitlist conversions use the approved new-camper financial terms', () => {
  assert.equal(NEW_CAMPER_ANNUAL_RENT, 1750)
  assert.equal(NEW_CAMPER_ASSOCIATION_FEE, 250)
})
