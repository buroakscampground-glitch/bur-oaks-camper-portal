import assert from 'node:assert/strict'
import test from 'node:test'
import { selectAuthenticatedCamperMatch, selectAuthenticatedEmailMatch } from '../lib/server-auth.ts'

test('selects one active camper account', () => {
  const camper = { id: 'camper-1', role: 'camper', active: true }
  assert.equal(selectAuthenticatedCamperMatch([camper]), camper)
})

test('selects the one staff account when the email is also on a camper profile', () => {
  const camper = { id: 'camper-1', role: 'camper', active: true }
  const coordinator = { id: 'staff-1', role: 'camper', lot_number: 'STAFF-EVENTS', active: true }
  assert.equal(selectAuthenticatedCamperMatch([camper, coordinator]), coordinator)
})

test('does not guess between multiple camper accounts', () => {
  assert.equal(selectAuthenticatedCamperMatch([
    { id: 'camper-1', role: 'camper', active: true },
    { id: 'camper-2', role: 'camper', active: true },
  ]), null)
})

test('does not guess between multiple staff accounts', () => {
  assert.equal(selectAuthenticatedCamperMatch([
    { id: 'admin-1', role: 'admin', active: true },
    { id: 'staff-1', role: 'camper', lot_number: 'STAFF-EVENTS', active: true },
  ]), null)
})

test('deduplicates a profile matched as both primary and secondary email', () => {
  const coordinator = { id: 'staff-1', role: 'camper', lot_number: 'STAFF-EVENTS', active: true }
  assert.equal(selectAuthenticatedCamperMatch([coordinator, { ...coordinator }])?.id, 'staff-1')
})

test('prefers the active primary-email profile over authorized-contact profiles', () => {
  const coordinator = { id: 'staff-1', role: 'camper', lot_number: 'STAFF-EVENTS', active: true }
  const otherProfile = { id: 'camper-1', role: 'admin', active: true }
  assert.equal(selectAuthenticatedEmailMatch([coordinator], [otherProfile]), coordinator)
})

test('uses a secondary-email profile only when there is no active primary match', () => {
  const camper = { id: 'camper-1', role: 'camper', active: true }
  assert.equal(selectAuthenticatedEmailMatch([], [camper]), camper)
})
