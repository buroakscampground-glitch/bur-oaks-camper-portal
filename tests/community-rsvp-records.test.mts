import assert from 'node:assert/strict'
import test from 'node:test'
import { unifiedCommunityRsvps } from '../lib/community-rsvp-records.ts'

test('uses the special Thanksgiving signup as the authoritative RSVP source', () => {
  const events = [
    { id: 'regular', title: 'Halloween at Bur Oaks', event_date: '2026-10-31' },
    { id: 'giving', title: 'BurOaksGiving Feast', event_date: '2026-11-07' },
  ]
  const eventRsvps = [
    { id: 'regular-rsvp', event_id: 'regular', camper_id: 'a', response: 'Going' },
    { id: 'duplicate-giving', event_id: 'giving', camper_id: 'b', response: 'Going' },
    { id: 'incomplete-giving', event_id: 'giving', camper_id: 'c', response: 'Going' },
  ]
  const dinnerSignups = [
    { id: 'meal-b', camper_id: 'b', attending_status: 'Going', guest_count: 4, bringing: 'Dinner rolls', lot_number: '10', camper_name: 'Camper B' },
    { id: 'meal-d', camper_id: 'd', attending_status: 'Not Going', guest_count: 1, lot_number: '11', camper_name: 'Camper D' },
  ]

  const result = unifiedCommunityRsvps(events, eventRsvps, dinnerSignups)

  assert.deepEqual(result.rsvps, [
    { id: 'regular-rsvp', event_id: 'regular', camper_id: 'a', response: 'Going', guest_count: 1, bringing: '', lot_number: '', camper_name: '', source: 'event' },
    { id: 'thanksgiving-meal-b', event_id: 'giving', camper_id: 'b', response: 'Going', guest_count: 4, bringing: 'Dinner rolls', lot_number: '10', camper_name: 'Camper B', source: 'thanksgiving' },
    { id: 'thanksgiving-meal-d', event_id: 'giving', camper_id: 'd', response: 'Not Going', guest_count: 1, bringing: '', lot_number: '11', camper_name: 'Camper D', source: 'thanksgiving' },
  ])
  assert.deepEqual(result.incompleteThanksgivingRsvps, [
    { id: 'incomplete-giving', event_id: 'giving', camper_id: 'c', response: 'Going' },
  ])
})
