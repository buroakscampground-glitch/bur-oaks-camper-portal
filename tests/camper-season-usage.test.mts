import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCamperSeasonUsage, camperUsageSeasonWindow } from '../lib/camper-season-usage.ts'

test('camper usage season runs from March 15 through November 15', () => {
  assert.deepEqual(camperUsageSeasonWindow(2026), { start: '2026-03-15', end: '2026-11-15' })
})

test('usage totals include only readings inside the selected season', () => {
  const rows = buildCamperSeasonUsage(
    [{ id: 'a', first_name: 'Sally', last_name: 'Camper', lot_number: '7' }],
    [
      { camper_id: 'a', reading_date: '2026-03-14', kwh_used: 500 },
      { camper_id: 'a', reading_date: '2026-03-15', kwh_used: 20 },
      { camper_id: 'a', reading_date: '2026-04-15', kwh_used: 30 },
      { camper_id: 'a', reading_date: '2026-11-16', kwh_used: 900 },
    ],
    2026,
  )
  assert.equal(rows[0].totalKwh, 50)
  assert.equal(rows[0].readingCount, 2)
  assert.equal(rows[0].latestDate, '2026-04-15')
  assert.equal(rows[0].usageBand, 'A lot')
})

test('usage learning compares a site with its own earlier seasons', () => {
  const rows = buildCamperSeasonUsage(
    [{ id: 'a', first_name: 'Sally', last_name: 'Camper', lot_number: '7' }],
    [
      { camper_id: 'a', reading_date: '2025-04-15', kwh_used: 200 },
      { camper_id: 'a', reading_date: '2025-05-15', kwh_used: 200 },
      { camper_id: 'a', reading_date: '2026-04-15', kwh_used: 20 },
      { camper_id: 'a', reading_date: '2026-05-15', kwh_used: 20 },
    ],
    2026,
  )
  assert.equal(rows[0].priorSeasonCount, 1)
  assert.equal(rows[0].historicalAverageSeasonKwh, 400)
  assert.equal(rows[0].signal, 'low')
  assert.equal(rows[0].changeFromHistoryPercent, -90)
})

test('two recent zero periods create an inactivity review signal', () => {
  const rows = buildCamperSeasonUsage(
    [{ id: 'a', first_name: 'Sally', last_name: 'Camper', lot_number: '7' }],
    [
      { camper_id: 'a', reading_date: '2026-04-15', kwh_used: 100 },
      { camper_id: 'a', reading_date: '2026-05-15', kwh_used: 0 },
      { camper_id: 'a', reading_date: '2026-06-15', kwh_used: 0 },
    ],
    2026,
  )
  assert.equal(rows[0].signal, 'no_activity')
  assert.match(rows[0].signalLabel, /recent/i)
})

test('plain-language usage bands separate no use from light and heavy use', () => {
  const rows = buildCamperSeasonUsage(
    [
      { id: 'none', lot_number: '1' },
      { id: 'little', lot_number: '2' },
      { id: 'sometimes', lot_number: '3' },
      { id: 'often', lot_number: '4' },
      { id: 'lot', lot_number: '5' },
    ],
    [
      { camper_id: 'none', reading_date: '2026-04-15', kwh_used: 0 },
      { camper_id: 'little', reading_date: '2026-04-15', kwh_used: 5 },
      { camper_id: 'sometimes', reading_date: '2026-04-15', kwh_used: 25 },
      { camper_id: 'often', reading_date: '2026-04-15', kwh_used: 100 },
      { camper_id: 'lot', reading_date: '2026-04-15', kwh_used: 500 },
    ],
    2026,
  )
  assert.deepEqual(rows.map((row) => row.usageBand), ['Not at all', 'A little', 'Sometimes', 'Often', 'A lot'])
})

test('multiple authorized camper records on one site combine into one usage picture', () => {
  const rows = buildCamperSeasonUsage(
    [{ id: 'primary', camper_ids: ['primary', 'authorized'], first_name: 'Site', last_name: 'Family', lot_number: '9' }],
    [
      { camper_id: 'primary', reading_date: '2026-04-15', kwh_used: 20 },
      { camper_id: 'authorized', reading_date: '2026-04-15', kwh_used: 30 },
    ],
    2026,
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].totalKwh, 50)
  assert.equal(rows[0].readingCount, 1)
})

test('usage bands rank the season running total instead of the per-reading average', () => {
  const rows = buildCamperSeasonUsage(
    [
      { id: 'steady', lot_number: '1' },
      { id: 'single', lot_number: '2' },
      { id: 'middle', lot_number: '3' },
      { id: 'high', lot_number: '4' },
    ],
    [
      { camper_id: 'steady', reading_date: '2026-04-15', kwh_used: 60 },
      { camper_id: 'steady', reading_date: '2026-05-15', kwh_used: 60 },
      { camper_id: 'single', reading_date: '2026-04-15', kwh_used: 100 },
      { camper_id: 'middle', reading_date: '2026-04-15', kwh_used: 200 },
      { camper_id: 'high', reading_date: '2026-04-15', kwh_used: 400 },
    ],
    2026,
  )
  assert.equal(rows.find((row) => row.camperId === 'steady')?.totalKwh, 120)
  assert.equal(rows.find((row) => row.camperId === 'steady')?.usageBand, 'Sometimes')
  assert.equal(rows.find((row) => row.camperId === 'single')?.usageBand, 'A little')
})

test('consecutive seasons in the lowest-use group create a repeated-use warning', () => {
  const rows = buildCamperSeasonUsage(
    [
      { id: 'low', lot_number: '1' },
      { id: 'regular', lot_number: '2' },
      { id: 'high', lot_number: '3' },
      { id: 'highest', lot_number: '4' },
    ],
    [
      { camper_id: 'low', reading_date: '2025-04-15', kwh_used: 10 },
      { camper_id: 'regular', reading_date: '2025-04-15', kwh_used: 100 },
      { camper_id: 'high', reading_date: '2025-04-15', kwh_used: 200 },
      { camper_id: 'highest', reading_date: '2025-04-15', kwh_used: 300 },
      { camper_id: 'low', reading_date: '2026-04-15', kwh_used: 10 },
      { camper_id: 'regular', reading_date: '2026-04-15', kwh_used: 100 },
      { camper_id: 'high', reading_date: '2026-04-15', kwh_used: 200 },
      { camper_id: 'highest', reading_date: '2026-04-15', kwh_used: 300 },
    ],
    2026,
  )
  const low = rows.find((row) => row.camperId === 'low')
  assert.equal(low?.consecutiveLowSeasonCount, 2)
  assert.equal(low?.signal, 'low')
  assert.match(low?.signalLabel || '', /Repeated/i)
})
