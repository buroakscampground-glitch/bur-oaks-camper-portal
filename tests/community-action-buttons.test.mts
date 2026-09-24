import assert from 'node:assert/strict'
import test from 'node:test'

import {
  communityActionHref,
  communityActionLabel,
  normalizeCommunityActionType,
  safeCommunityActionUrl,
} from '../lib/community-actions.ts'

test('built-in Messenger buttons always resolve to their working camper destinations', () => {
  assert.equal(communityActionHref('events', '/events'), '/calendar')
  assert.equal(communityActionHref('dinners', '/wrong-place'), '/dinners')
  assert.equal(communityActionHref('contact', ''), '/messages')
  assert.equal(communityActionLabel('events'), 'View events and RSVP')
})

test('built-in Messenger buttons open the matching admin workspace for staff', () => {
  assert.equal(communityActionHref('events', '/calendar', 'admin'), '/admin/events')
  assert.equal(communityActionHref('dinners', '/dinners', 'admin'), '/admin/dinners')
  assert.equal(communityActionHref('contact', '/messages', 'admin'), '/admin/messages')
})

test('custom Messenger buttons accept portal paths and secure external links', () => {
  assert.equal(safeCommunityActionUrl('/portal/events/fall-festival'), '/portal/events/fall-festival')
  assert.equal(safeCommunityActionUrl('https://example.com/details'), 'https://example.com/details')
  assert.equal(communityActionHref('custom', '/calendar'), '/calendar')
})

test('custom Messenger buttons reject missing or unsafe destinations', () => {
  assert.equal(safeCommunityActionUrl(''), null)
  assert.equal(safeCommunityActionUrl('//example.com/trick'), null)
  assert.equal(safeCommunityActionUrl('http://example.com'), null)
  assert.equal(safeCommunityActionUrl('javascript:alert(1)'), null)
  assert.equal(safeCommunityActionUrl('/events\\broken'), null)
  assert.equal(normalizeCommunityActionType('unknown'), null)
})
