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

test('the separate Community workspace registers the correct phone alert type for each staff role', () => {
  const permission = readFileSync(new URL('../components/CommunityAppBadgePermission.tsx', import.meta.url), 'utf8')
  const home = readFileSync(new URL('../app/community/page.tsx', import.meta.url), 'utf8')

  assert.match(permission, /role === 'admin'/)
  assert.match(permission, /label="your Admin alerts" staffApp="admin"/)
  assert.match(permission, /label="your Event Coordinator alerts" staffApp="community"/)
  assert.match(home, /<CommunityAppBadgePermission \/>/)
})

test('failed badge setup explains what the admin must change on the phone', () => {
  const permission = readFileSync(new URL('../components/AppBadgePermission.tsx', import.meta.url), 'utf8')

  assert.match(permission, /Open iPhone Settings, choose Notifications, then Bur Oaks/)
  assert.match(permission, /<small role="alert">\{detail\}<\/small>/)
})

test('Dawn Community Talk is one feed without the Admin or event-planning navigation', () => {
  const talk = readFileSync(new URL('../app/community/talk/page.tsx', import.meta.url), 'utf8')
  const chrome = readFileSync(new URL('../components/CommunityChrome.tsx', import.meta.url), 'utf8')
  const adminHome = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8')

  assert.match(talk, /<CommunityFeed \/>/)
  assert.doesNotMatch(talk, /adminMode/)
  assert.match(chrome, /pathname === '\/community\/talk'/)
  assert.match(chrome, /community-talk-content/)
  assert.doesNotMatch(chrome.match(/if \(pathname === '\/community\/talk'[\s\S]*?\n  \}/)?.[0] || '', /Admin Command Center|Birthdays|Announcements|Events|Dinners|RSVPs/)
  assert.match(adminHome, /href="\/community\/talk"/)
})
