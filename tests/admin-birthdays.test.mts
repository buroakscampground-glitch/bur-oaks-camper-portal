import assert from 'node:assert/strict'
import test from 'node:test'
import { birthdayOccurrence, birthdayWindowLabel } from '../lib/admin-birthdays.ts'

test('birthday office window includes missed, today, and upcoming birthdays', () => {
  const today = { year: 2026, month: 9, day: 2 }
  assert.equal(birthdayOccurrence('1980-08-31', today)?.window, 'missed')
  assert.equal(birthdayOccurrence('1980-09-02', today)?.window, 'today')
  assert.equal(birthdayOccurrence('1980-09-15', today)?.window, 'upcoming')
  assert.equal(birthdayOccurrence('1980-06-15', today), null)
})

test('birthday office window crosses the new year and handles leap birthdays', () => {
  assert.deepEqual(
    birthdayOccurrence('1980-01-03', { year: 2026, month: 12, day: 31 })?.iso,
    '2027-01-03'
  )
  assert.deepEqual(
    birthdayOccurrence('1980-02-29', { year: 2027, month: 2, day: 28 })?.iso,
    '2027-02-28'
  )
})

test('birthday timing labels are easy for the office to scan', () => {
  assert.equal(birthdayWindowLabel(0), 'Today')
  assert.equal(birthdayWindowLabel(-1), 'Yesterday')
  assert.equal(birthdayWindowLabel(7), 'In 7 days')
})
