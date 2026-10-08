import assert from 'node:assert/strict'
import test from 'node:test'
import { anniversaryYears, birthdayIsToday, centralDate } from '../lib/celebration-dates.ts'

test('celebration dates use the campground Central calendar', () => {
  const beforeCentralMidnight = centralDate(new Date('2026-10-08T04:30:00Z'))
  assert.deepEqual(beforeCentralMidnight, { year: 2026, month: 10, day: 7, iso: '2026-10-07' })
  assert.equal(birthdayIsToday('1980-10-07', beforeCentralMidnight), true)
  assert.equal(anniversaryYears('2020-10-07', beforeCentralMidnight), 6)
})

test('impossible celebration dates never generate a greeting', () => {
  const today = { year: 2026, month: 2, day: 28, iso: '2026-02-28' }
  assert.equal(birthdayIsToday('1980-02-30', today), false)
  assert.equal(anniversaryYears('2020-02-30', today), 0)
  assert.equal(birthdayIsToday('not-a-date', today), false)
})
