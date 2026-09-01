import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSiteAvailability } from '../lib/site-availability.ts'

test('availability separates vacant sites, confirmed openings, and possible openings by month', () => {
  const result = buildSiteAvailability({
    today: '2026-09-01',
    lots: [{ lot_number: '1' }, { lot_number: '2' }, { lot_number: '3' }, { lot_number: '1001' }],
    campers: [
      { id: 'a', lot_number: '1', first_name: 'Active', last_name: 'Camper', active: true, role: 'camper' },
      { id: 'b', lot_number: '2', first_name: 'Leaving', last_name: 'Camper', active: true, role: 'camper' },
    ],
    renewals: [
      { camper_id: 'b', lot_number: '2', contract_end_date: '2026-10-31', status: 'Camper Leaving' },
      { camper_id: 'a', lot_number: '1', contract_end_date: '2026-12-31', status: 'Awaiting Response' },
    ],
  })

  assert.deepEqual(result.availableNow.map((site) => site.lotNumber), ['3'])
  assert.deepEqual(result.months.find((month) => month.key === '2026-11')?.confirmed.map((site) => site.lotNumber), ['2'])
  assert.deepEqual(result.months.find((month) => month.key === '2027-01')?.possible.map((site) => site.lotNumber), ['1'])
})

test('a past confirmed opening is held for office clearance instead of called vacant', () => {
  const result = buildSiteAvailability({
    today: '2026-09-01',
    lots: [{ lot_number: '7' }],
    campers: [{ id: 'c', lot_number: '7', first_name: 'Moving', last_name: 'Out', active: true, role: 'camper' }],
    renewals: [{ camper_id: 'c', lot_number: '7', contract_end_date: '2026-08-15', status: 'Campground Not Renewing' }],
  })

  assert.equal(result.availableNow.length, 0)
  assert.equal(result.overdueOpenings[0]?.lotNumber, '7')
  assert.match(result.overdueOpenings[0]?.reason || '', /Confirm the site is cleared/)
})
