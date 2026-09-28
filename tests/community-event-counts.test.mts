import assert from 'node:assert/strict'
import test from 'node:test'
import { communityEventCounts } from '../lib/community-event-counts.ts'

test('BurOaksGiving uses Thanksgiving household responses and confirmed people', () => {
  const events = [
    { id: 'thanksgiving', event_date: '2026-11-07', title: 'BurOaksGiving Feast' },
    { id: 'halloween', event_date: '2026-10-31', title: 'Halloween at Bur Oaks' },
  ]
  const rsvps = [
    { event_id: 'thanksgiving', response: 'Going' },
    { event_id: 'halloween', response: 'Going' },
    { event_id: 'halloween', response: 'Maybe' },
  ]
  const thanksgivingSignups = [
    { attending_status: 'Going', guest_count: 4 },
    { attending_status: 'Going', guest_count: 2 },
    { attending_status: 'Maybe', guest_count: 3 },
    { attending_status: 'Not Going', guest_count: 2 },
  ]

  assert.deepEqual(communityEventCounts(events, rsvps, thanksgivingSignups), {
    thanksgiving: { rsvps: 4, going: 6, goingUnit: 'people' },
    halloween: { rsvps: 2, going: 1, goingUnit: 'campsites' },
  })
})
