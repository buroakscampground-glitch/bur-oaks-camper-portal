import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { safeErrorReference } from '../lib/error-reference.ts'

const routeError = await readFile(new URL('../app/error.tsx', import.meta.url), 'utf8')
const rootError = await readFile(new URL('../app/global-error.tsx', import.meta.url), 'utf8')

test('error references expose only short opaque digests', () => {
  assert.equal(safeErrorReference('abc-1234'), 'abc-1234')
  assert.equal(safeErrorReference('  QWER-9876  '), 'QWER-9876')
  assert.equal(safeErrorReference('contains spaces and a camper name'), '')
  assert.equal(safeErrorReference('x'.repeat(41)), '')
  assert.equal(safeErrorReference(undefined), '')
})

test('route failures warn against duplicate payment and form retries', () => {
  assert.match(routeError, /check its status before trying it again/i)
  assert.match(routeError, /Support reference/)
  assert.match(routeError, /Try again/)
  assert.match(routeError, /Return home/)
  assert.doesNotMatch(routeError, /Your information has not been changed/)
})

test('a root-level branded fallback remains available when the layout fails', () => {
  assert.match(rootError, /<html lang="en">/)
  assert.match(rootError, /<body/)
  assert.match(rootError, /Bur Oaks Campground/)
  assert.match(rootError, /check its status before trying it again/i)
  assert.match(rootError, /Support reference/)
})
