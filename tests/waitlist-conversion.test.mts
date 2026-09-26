import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canConvertWaitlistStatus,
  cleanWaitlistConversionValue,
  newCamperContractEndDate,
  newCamperRentSchedule,
  nextTemporaryPortalSite,
  NEW_CAMPER_ANNUAL_RENT,
  NEW_CAMPER_ASSOCIATION_FEE,
  NEW_CAMPER_INSTALLMENT,
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
  assert.equal(NEW_CAMPER_INSTALLMENT, 875)
  assert.equal(NEW_CAMPER_ASSOCIATION_FEE, 250)
})

test('new campers receive two $875 payments six months apart with normalized due dates', () => {
  assert.deepEqual(newCamperRentSchedule('2026-09-15'), [
    { installment: 1, amount: 875, dueDate: '2026-09-01' },
    { installment: 2, amount: 875, dueDate: '2027-03-01' },
  ])
  assert.deepEqual(newCamperRentSchedule('2026-09-16'), [
    { installment: 1, amount: 875, dueDate: '2026-10-01' },
    { installment: 2, amount: 875, dueDate: '2027-04-01' },
  ])
  assert.equal(newCamperContractEndDate('2026-09-16'), '2027-09-16')
})

test('temporary portal spots do not impersonate physical campsite numbers', () => {
  assert.equal(nextTemporaryPortalSite(['Site 2', 'TEMP PORTAL 1', 'temp portal 3']), 'TEMP PORTAL 4')
  const copy = waitlistWelcomeCopy('Pat', 'TEMP PORTAL 4', true)
  assert.match(copy.message, /temporary portal access/)
  assert.match(copy.message, /permanent campsite becomes available/)
  assert.doesNotMatch(copy.message, /Site TEMP/)
})
