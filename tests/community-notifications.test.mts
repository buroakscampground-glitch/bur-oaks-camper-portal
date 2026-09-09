import assert from 'node:assert/strict'
import test from 'node:test'
import { camperCommunityEmails, defaultCommunityPreferences, normalizeCommunityMode } from '../lib/community-notifications.ts'

test('community notification defaults stay calm and email-first', () => {
  assert.equal(defaultCommunityPreferences.community_mode, 'daily_summary')
  assert.equal(defaultCommunityPreferences.replies_mode, 'right_away')
  assert.equal(defaultCommunityPreferences.official_mode, 'right_away')
  assert.equal(defaultCommunityPreferences.quiet_hours_enabled, true)
})

test('unknown notification values safely fall back to one daily summary', () => {
  assert.equal(normalizeCommunityMode('right_away'), 'right_away')
  assert.equal(normalizeCommunityMode('portal_only'), 'portal_only')
  assert.equal(normalizeCommunityMode('text_every_post'), 'daily_summary')
  assert.equal(normalizeCommunityMode(null), 'daily_summary')
})

test('community email recipients are normalized and deduplicated', () => {
  assert.deepEqual(camperCommunityEmails({ email: 'Camper@Example.com ', secondary_email: 'camper@example.com' }), ['camper@example.com'])
  assert.deepEqual(camperCommunityEmails({ email: '', secondary_email: 'invalid' }), [])
})
