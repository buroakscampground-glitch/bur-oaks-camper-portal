import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('admin home billing totals refresh while payments are being recorded', () => {
  const adminHome = source('../app/admin/page.tsx')

  assert.match(adminHome, /setInterval\(refreshDashboard, 30_000\)/)
  assert.match(adminHome, /addEventListener\('focus', refreshDashboard\)/)
  assert.match(adminHome, /addEventListener\('pageshow', refreshDashboard\)/)
  assert.match(adminHome, /addEventListener\('visibilitychange', refreshWhenVisible\)/)
})
