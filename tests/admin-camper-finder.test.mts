import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the admin workspace keeps a protected camper finder available everywhere', () => {
  const chrome = read('components/AdminChrome.tsx')
  const finder = read('components/AdminCamperFinder.tsx')
  const endpoint = read('app/api/admin-camper-lookup/route.ts')

  assert.match(chrome, /<AdminCamperFinder \/>/)
  assert.match(endpoint, /getAuthenticatedContext/)
  assert.match(endpoint, /context\.camper\.role/)
  assert.match(endpoint, /Admin access is required/)
  assert.match(endpoint, /'Cache-Control': 'no-store'/)
  assert.doesNotMatch(endpoint, /\.eq\('active', true\)/)
  assert.match(finder, /ARCHIVED/)
  assert.match(finder, /Find camper, lot, check, invoice/)
  assert.match(finder, /event\.key === '\/'/)
})

test('camper finder searches financial references and jumps to separate account sections', () => {
  const endpoint = read('app/api/admin-camper-lookup/route.ts')
  const finder = read('components/AdminCamperFinder.tsx')
  const historyEndpoint = read('app/api/admin-site-history/route.ts')
  const camperProfile = read('app/admin/campers/[id]/page.tsx')

  assert.match(endpoint, /payment_reference/)
  assert.match(endpoint, /invoice_number/)
  assert.match(endpoint, /source_reference/)
  assert.match(endpoint, /lastPayment/)
  assert.match(endpoint, /nextDue/)
  for (const section of ['Payments', 'Invoices', 'Credits', 'Documents', 'Messages', 'Site', 'Electric', 'Association', 'Renewal', 'Profile']) {
    assert.match(finder, new RegExp(`${section}</a>`))
  }
  assert.match(finder, /replace\(\/\[\^a-z0-9\]\//)
  assert.match(historyEndpoint, /payment_reference/)
  assert.match(camperProfile, /invoice\.payment_reference/)
})
