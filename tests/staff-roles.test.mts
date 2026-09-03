import assert from 'node:assert/strict'
import test from 'node:test'
import { canManageCommunity, portalDestinationForRole } from '../lib/staff-roles.ts'
import { isOperationalCamper } from '../lib/camper-records.ts'

test('event coordinators land in the limited community workspace', () => {
  assert.equal(portalDestinationForRole('event_coordinator'), '/community')
  assert.equal(canManageCommunity('event_coordinator'), true)
})

test('community access does not grant owner or maintenance roles', () => {
  assert.equal(canManageCommunity('admin'), true)
  assert.equal(canManageCommunity('maintenance'), false)
  assert.equal(canManageCommunity('camper'), false)
  assert.equal(isOperationalCamper({ role: 'event_coordinator', lot_number: 'STAFF' }), false)
})
