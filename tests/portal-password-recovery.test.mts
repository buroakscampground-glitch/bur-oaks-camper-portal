import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('password setup survives an iPhone Mail or Safari page reload', () => {
  const pageSource = readFileSync(new URL('../app/set-password/page.tsx', import.meta.url), 'utf8')
  const formSource = readFileSync(new URL('../app/set-password/password-form.tsx', import.meta.url), 'utf8')

  assert.match(formSource, /sessionStorage\.setItem\(SETUP_TOKEN_STORAGE_KEY/)
  assert.match(formSource, /const cachedToken = readCachedSetupToken\(\)/)
  assert.match(formSource, /setSetupToken\(cachedToken\)[\s\S]*setReady\(true\)/)
  assert.match(formSource, /cacheSetupToken\(null\)[\s\S]*setSetupToken\(null\)/)
  assert.match(pageSource, /initialToken=\{tokenHash && type \? \{ tokenHash, type \} : null\}/)
})

test('password setup has a secure no-JavaScript form fallback for older phones', () => {
  const formSource = readFileSync(new URL('../app/set-password/password-form.tsx', import.meta.url), 'utf8')
  const routeSource = readFileSync(new URL('../app/api/complete-portal-setup/route.ts', import.meta.url), 'utf8')

  assert.match(formSource, /action="\/api\/complete-portal-setup"/)
  assert.match(formSource, /method="post"/)
  assert.match(formSource, /name="tokenHash"/)
  assert.doesNotMatch(formSource, /name="confirmation"/)
  assert.match(formSource, /if \(setupToken\)[\s\S]*submitButton\.disabled = true[\s\S]*return/)
  assert.match(formSource, /event\.preventDefault\(\)[\s\S]*if \(submitStarted\.current\) return/)
  assert.match(routeSource, /isFormSubmission/)
  assert.match(routeSource, /confirmation && password !== confirmation/)
  assert.match(routeSource, /retryUrl\.searchParams\.set\('token_hash', tokenHash\)/)
  assert.match(routeSource, /formRetryResponse\('password-mismatch', tokenHash, verificationType\)/)
  assert.match(routeSource, /\/login\?passwordUpdated=1/)
})
