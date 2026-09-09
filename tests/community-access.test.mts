import assert from 'node:assert/strict'
import test from 'node:test'
import { canParticipateInCommunity, canViewCommunity, communityAccessLabel, normalizeCommunityAccess } from '../lib/community-access.ts'

test('unknown community access stays active instead of accidentally blocking campers', () => {
  assert.equal(normalizeCommunityAccess(undefined), 'active')
  assert.equal(canViewCommunity(undefined), true)
  assert.equal(canParticipateInCommunity(undefined), true)
})

test('read-only campers can view but cannot post or comment', () => {
  assert.equal(canViewCommunity('read_only'), true)
  assert.equal(canParticipateInCommunity('read_only'), false)
  assert.equal(communityAccessLabel('read_only'), 'Read-only')
})

test('blocked campers cannot enter the Community', () => {
  assert.equal(canViewCommunity('blocked'), false)
  assert.equal(canParticipateInCommunity('blocked'), false)
  assert.equal(communityAccessLabel('blocked'), 'Community access blocked')
})
