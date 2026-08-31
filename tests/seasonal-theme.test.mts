import assert from 'node:assert/strict'
import test from 'node:test'
import { getSeasonalTheme } from '../lib/seasonal-theme.ts'

function centralNoon(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 18))
}

test('Labor Day theme begins a full week early and changes to fall afterward', () => {
  assert.equal(getSeasonalTheme(centralNoon(2026, 8, 31)).key, 'patriotic')
  assert.equal(getSeasonalTheme(centralNoon(2026, 9, 7)).key, 'patriotic')
  assert.equal(getSeasonalTheme(centralNoon(2026, 9, 8)).key, 'fall')
})

test('Halloween covers all October and Christmas covers all December', () => {
  assert.equal(getSeasonalTheme(centralNoon(2026, 10, 1)).key, 'halloween')
  assert.equal(getSeasonalTheme(centralNoon(2026, 10, 31)).key, 'halloween')
  assert.equal(getSeasonalTheme(centralNoon(2026, 12, 1)).key, 'christmas')
  assert.equal(getSeasonalTheme(centralNoon(2026, 12, 31)).key, 'christmas')
})
