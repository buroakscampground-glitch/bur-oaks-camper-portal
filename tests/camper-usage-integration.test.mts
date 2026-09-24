import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('site history uses the same seasonal usage calculation as the usage dashboard', () => {
  const route = source('app/api/admin-site-history/route.ts')
  assert.match(route, /buildCamperSeasonUsage/)
  assert.match(route, /usageCampersBySite/)
  assert.match(route, /usageReadingResult/)
  assert.match(route, /usage,\s*activity/)
})

test('renewal decisions show the shared season usage signal', () => {
  const renewals = source('app/admin/renewals/page.tsx')
  assert.match(renewals, /Season use/)
  assert.match(renewals, /siteHistory\.usage\.signalLabel/)
  assert.match(renewals, /Open usage analytics/)
  assert.match(renewals, /camper-usage\?search=/)
})

test('camper profiles show season usage beside permanent history', () => {
  const profile = source('app/admin/campers/[id]/page.tsx')
  assert.match(profile, /Season usage/)
  assert.match(profile, /SEASON RUNNING TOTAL/)
  assert.match(profile, /Open campground comparison/)
})

test('the usage dashboard accepts profile and renewal deep-link searches', () => {
  const usage = source('app/admin/camper-usage/page.tsx')
  assert.match(usage, /new URLSearchParams\(window\.location\.search\)\.get\('search'\)/)
  assert.match(usage, /setFilter\('all'\)/)
})
