import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalSaturdayDinnerSignups,
  saturdayDinnerEngagementStartDate,
  saturdayDinnerMetrics,
} from '../lib/saturday-dinner-metrics.ts'

test('yearly dinner engagement begins when portal tracking became consistent', () => {
  assert.equal(saturdayDinnerEngagementStartDate, '2026-10-10')
})

test('Saturday dinner totals keep campsites, people, responses, and dishes separate', () => {
  const signups = [
    { id: '1', dinner_date: '2026-10-10', camper_id: 'a', attending_status: 'Going', guest_count: 4, bringing: 'Baked beans' },
    { id: '2', dinner_date: '2026-10-10', camper_id: 'b', attending_status: 'Going', guest_count: 2, bringing: '' },
    { id: '3', dinner_date: '2026-10-10', camper_id: 'c', attending_status: 'Maybe', guest_count: 3, bringing: 'Coleslaw' },
    { id: '4', dinner_date: '2026-10-10', camper_id: 'd', attending_status: 'Not Going', guest_count: 8, bringing: '' },
  ]

  assert.deepEqual(saturdayDinnerMetrics(signups), {
    responses: 4,
    goingCampsites: 2,
    maybeCampsites: 1,
    notGoingCampsites: 1,
    confirmedPeople: 6,
    possiblePeople: 3,
    confirmedDishes: 1,
    possibleDishes: 1,
    goingWithoutDish: 1,
  })
})

test('older duplicate rows do not inflate the dinner totals', () => {
  const rows = [
    { id: 'old', dinner_date: '2026-10-10', camper_id: 'a', attending_status: 'Maybe', guest_count: 2, updated_at: '2026-10-01T12:00:00Z' },
    { id: 'new', dinner_date: '2026-10-10', camper_id: 'a', attending_status: 'Going', guest_count: 4, updated_at: '2026-10-02T12:00:00Z' },
  ]

  assert.equal(canonicalSaturdayDinnerSignups(rows).length, 1)
  assert.equal(canonicalSaturdayDinnerSignups(rows)[0].id, 'new')
  assert.equal(saturdayDinnerMetrics(rows).confirmedPeople, 4)
})
