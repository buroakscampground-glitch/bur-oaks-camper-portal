import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { communityActivityMessage, communityStaffRecipients } from '../lib/community-staff-alerts.ts'

test('Community activity alerts reach administrators and the Event Coordinator but not the actor', () => {
  const recipients = communityStaffRecipients([
    { id: 'admin', role: 'admin', active: true },
    { id: 'rachel', role: 'camper', lot_number: 'STAFF-EVENTS', active: true },
    { id: 'camper', role: 'camper', lot_number: '41', active: true },
  ], 'camper')
  assert.deepEqual(recipients.map((camper) => camper.id), ['admin', 'rachel'])
})

test('Community staff alerts clearly identify the action, camper, and lot', () => {
  assert.equal(
    communityActivityMessage({ kind: 'like', actorName: 'Sample Camper', lotNumber: '41' }),
    'Sample Camper (Lot 41) liked a Community post.',
  )
  assert.equal(
    communityActivityMessage({ kind: 'post', actorName: 'Sample Camper', lotNumber: '41', detail: 'Hello neighbors' }),
    'Sample Camper (Lot 41) added a Community post: Hello neighbors',
  )
})

test('posts, comments, likes, reports, and administrative actions notify Community staff', () => {
  const route = readFileSync(new URL('../app/api/community-feed/route.ts', import.meta.url), 'utf8')
  for (const kind of ['post', 'comment', 'like', 'report', 'moderation', 'member_access']) {
    assert.match(route, new RegExp(`kind: '${kind}'`))
  }
})
