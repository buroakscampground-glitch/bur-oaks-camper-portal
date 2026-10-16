import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('password setup survives an iPhone Mail or Safari page reload', () => {
  const source = readFileSync(new URL('../app/set-password/page.tsx', import.meta.url), 'utf8')

  assert.match(source, /sessionStorage\.setItem\(SETUP_TOKEN_STORAGE_KEY/)
  assert.match(source, /const cachedToken = readCachedSetupToken\(\)/)
  assert.match(source, /setSetupToken\(cachedToken\)[\s\S]*setReady\(true\)/)
  assert.match(source, /cacheSetupToken\(null\)[\s\S]*setSetupToken\(null\)/)
})
