import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('every maintenance request entry point blocks rapid duplicate submissions', () => {
  const camperPage = read('app/maintenance/page.tsx')
  const staffPage = read('app/maintenance/dashboard/page.tsx')
  const adminPage = read('app/admin/maintenance/page.tsx')

  assert.match(camperPage, /if \(submittingRef\.current\) return/)
  assert.match(staffPage, /if \(submittingRequestRef\.current\) return/)
  assert.match(adminPage, /if \(creatingRef\.current\) return/)
})

test('every maintenance creation API ignores an identical recent request', () => {
  const routes = [
    'app/api/maintenance-request/route.ts',
    'app/api/maintenance-staff-request/route.ts',
    'app/api/admin-maintenance-ticket/route.ts',
  ]

  for (const route of routes) {
    const source = read(route)
    assert.match(source, /Date\.now\(\) - 30_000/)
    assert.match(source, /duplicate: true/)
    assert.match(source, /Duplicate submission ignored/)
  }
})
