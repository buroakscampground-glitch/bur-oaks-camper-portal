import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('camper billing APIs never return raw database errors', () => {
  for (const path of ['app/api/camper-invoices/route.ts', 'app/api/authorized-billing/route.ts']) {
    const source = read(path)
    assert.match(source, /reportOperationalFailure/)
    assert.match(source, /supportReferenceMessage/)
    assert.match(source, /requestId/)
    assert.doesNotMatch(source, /error\?\.message/)
    assert.doesNotMatch(source, /error:\s*error\.message/)
  }
})

test('camper billing failures give retry guidance without implying an empty balance', () => {
  const invoices = read('app/api/camper-invoices/route.ts')
  const authorized = read('app/api/authorized-billing/route.ts')

  assert.match(invoices, /billing details are temporarily unavailable\. Please try again\./)
  assert.match(authorized, /billing is temporarily unavailable\. Please try again\./)
  assert.doesNotMatch(invoices, /invoices:\s*\[\][\s\S]*catch/)
})
