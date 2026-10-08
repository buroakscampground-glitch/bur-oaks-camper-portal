import assert from 'node:assert/strict'
import test from 'node:test'
import { addCentralDays, daysUntilEvent } from '../lib/event-reminder-dates.ts'

test('event reminder dates cross month and year boundaries without daylight-saving drift', () => {
  const newYearsEve = { year: 2026, month: 12, day: 31, iso: '2026-12-31' }
  assert.equal(addCentralDays(newYearsEve, 1), '2027-01-01')
  assert.equal(daysUntilEvent('2027-01-07', newYearsEve), 7)

  const springClockChange = { year: 2026, month: 3, day: 7, iso: '2026-03-07' }
  assert.equal(addCentralDays(springClockChange, 1), '2026-03-08')
  assert.equal(daysUntilEvent('2026-03-08', springClockChange), 1)
})

test('invalid event dates fail closed instead of rolling into another month', () => {
  const today = { year: 2026, month: 2, day: 28, iso: '2026-02-28' }
  assert.equal(daysUntilEvent('2026-02-30', today), null)
  assert.equal(daysUntilEvent('2026-13-01', today), null)
  assert.equal(daysUntilEvent('not-a-date', today), null)
})
