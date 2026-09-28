import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { saturdayDinners2026 } from '../lib/saturday-dinners.ts'
import {
  thanksgivingClaimCounts,
  thanksgivingDinnerDate,
  thanksgivingFoodOptions,
} from '../lib/thanksgiving-dinner.ts'

test('Thanksgiving is a special November dinner with food-only choices', () => {
  const dinner = saturdayDinners2026.find((item) => item.date === thanksgivingDinnerDate)
  assert.equal(dinner?.menu, 'Bur Oaks Thanksgiving')
  assert.equal(thanksgivingDinnerDate, '2026-11-07')

  const labels = thanksgivingFoodOptions.map((option) => option.label.toLowerCase())
  assert.equal(labels.includes('turkey'), false, 'turkey should not be offered')
  for (const excluded of ['plate', 'fork', 'napkin', 'silverware']) {
    assert.equal(labels.some((label) => label.includes(excluded)), false, `${excluded} should not be offered`)
  }
})

test('large-group food limits prevent a flood of the same dishes', () => {
  assert.equal(thanksgivingFoodOptions.find((option) => option.id === 'mashed-potatoes')?.limit, 3)
  assert.equal(thanksgivingFoodOptions.find((option) => option.id === 'mac-cheese')?.limit, 2)
  assert.equal(thanksgivingFoodOptions.find((option) => option.id === 'rolls')?.limit, 3)
  assert.equal(thanksgivingFoodOptions.find((option) => option.id === 'dessert')?.limit, 2)
})

test('food coverage ignores campers who are not attending and a camper updating their own choice', () => {
  const counts = thanksgivingClaimCounts([
    { camper_id: 'one', attending_status: 'Going', bringing: 'Mashed potatoes' },
    { camper_id: 'two', attending_status: 'Maybe', bringing: 'Mashed potatoes' },
    { camper_id: 'three', attending_status: 'Not Going', bringing: 'Mashed potatoes' },
  ], 'one')

  assert.equal(counts.get('mashed-potatoes'), 1)
})

test('the camper portal and office dinner page prominently open the dedicated planner', async () => {
  const [portal, dinners, signup, api] = await Promise.all([
    readFile(new URL('../app/portal/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/dinners/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/thanksgiving/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/saturday-dinner/route.ts', import.meta.url), 'utf8'),
  ])

  assert.match(portal, /portal-thanksgiving-feature/)
  assert.match(portal, /Open Thanksgiving signup/)
  assert.match(dinners, /Open the Bur Oaks Thanksgiving board/)
  assert.match(signup, /Claim one food item/)
  assert.match(api, /already fully covered/)
})
