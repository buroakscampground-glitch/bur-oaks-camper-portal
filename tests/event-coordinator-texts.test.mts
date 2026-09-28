import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { portalPathForTextAlert } from '../lib/portal-sms-links.ts'
import { effectivePortalRole } from '../lib/staff-roles.ts'

test('Event Coordinator text destinations open the useful camper area', () => {
  assert.equal(portalPathForTextAlert('Event Reminder', 'Please RSVP'), '/calendar')
  assert.equal(portalPathForTextAlert('Saturday Dinner Reminder', 'Please RSVP'), '/dinners')
  assert.equal(portalPathForTextAlert('Thanksgiving Signup', 'Please RSVP'), '/thanksgiving')
  assert.equal(portalPathForTextAlert('Community Update', 'New post'), '/campground-community')
})

test('Rachel has a Community text page without billing or emergency choices', async () => {
  const page = await readFile(new URL('../app/community/texts/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /Event Reminder/)
  assert.match(page, /Saturday Dinner Reminder/)
  assert.match(page, /Thanksgiving Signup/)
  assert.match(page, /Community Update/)
  assert.doesNotMatch(page, /Invoice Reminder/)
  assert.doesNotMatch(page, /Emergency Alert/)
  assert.match(page, /targetMode: 'all_opted_in'/)
})

test('the text API enforces Event Coordinator scope on the server', async () => {
  const route = await readFile(new URL('../app/api/text-alerts/route.ts', import.meta.url), 'utf8')
  assert.match(route, /eventCoordinatorTextTypes/)
  assert.match(route, /Event Coordinators can send only event, dinner, Thanksgiving, or Community updates/)
  assert.match(route, /Event Coordinator texts can be sent only to all opted-in campers/)
  assert.match(route, /canManageCommunity/)
  assert.match(route, /effectivePortalRole\(context\.camper\)/)
  assert.doesNotMatch(route, /effectivePortalRole\(context\.camper\.role\)/)
})

test('Rachel staff records resolve to Event Coordinator access', () => {
  assert.equal(effectivePortalRole({ role: 'event_coordinator' }), 'event_coordinator')
  assert.equal(effectivePortalRole({ role: 'camper', lot_number: 'STAFF-EVENTS' }), 'event_coordinator')
})
