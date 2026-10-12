import assert from 'node:assert/strict'
import test from 'node:test'
import { communityEventCounts } from '../lib/community-event-counts.ts'

test('BurOaksGiving uses Thanksgiving household responses and confirmed people', () => {
  const events = [
    { id: 'thanksgiving', event_date: '2026-11-07', title: 'BurOaksGiving Feast' },
    { id: 'halloween', event_date: '2026-10-31', title: 'Halloween at Bur Oaks' },
  ]
  const rsvps = [
    { event_id: 'thanksgiving', camper_id: 'pending', response: 'Going' },
    { event_id: 'halloween', response: 'Going' },
    { event_id: 'halloween', response: 'Maybe' },
  ]
  const thanksgivingSignups = [
    { camper_id: 'a', attending_status: 'Going', guest_count: 4 },
    { camper_id: 'b', attending_status: 'Going', guest_count: 2 },
    { camper_id: 'c', attending_status: 'Maybe', guest_count: 3 },
    { camper_id: 'd', attending_status: 'Not Going', guest_count: 2 },
  ]

  assert.deepEqual(communityEventCounts(events, rsvps, thanksgivingSignups), {
    thanksgiving: { rsvps: 5, going: 7, goingUnit: 'people' },
    halloween: { rsvps: 2, going: 1, goingUnit: 'campsites' },
  })
})

test('does not double count a Thanksgiving camper after they choose food', () => {
  const events = [{ id: 'thanksgiving', event_date: '2026-11-07', title: 'BurOaksGiving Feast' }]
  const rsvps = [{ event_id: 'thanksgiving', camper_id: 'same-camper', response: 'Going' }]
  const thanksgivingSignups = [{ camper_id: 'same-camper', attending_status: 'Going', guest_count: 3 }]

  assert.deepEqual(communityEventCounts(events, rsvps, thanksgivingSignups), {
    thanksgiving: { rsvps: 1, going: 3, goingUnit: 'people' },
  })
})
