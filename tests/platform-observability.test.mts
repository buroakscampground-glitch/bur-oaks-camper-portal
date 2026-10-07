import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8')
const health = await readFile(new URL('../app/api/health/route.ts', import.meta.url), 'utf8')
const login = await readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8')
const passwordReset = await readFile(new URL('../app/forgot-password/page.tsx', import.meta.url), 'utf8')

test('real page and API requests receive an opaque trace reference', () => {
  assert.match(proxy, /crypto\.randomUUID\(\)/)
  assert.match(proxy, /requestHeaders\.set\('x-request-id', requestId\)/)
  assert.match(proxy, /response\.headers\.set\('x-request-id', requestId\)/)
  assert.match(proxy, /_next\/static/)
  assert.match(proxy, /_next\/image/)
})

test('health endpoint is live, uncached, and reveals no customer data', () => {
  assert.match(health, /ok: true/)
  assert.match(health, /service: 'bur-oaks-portal'/)
  assert.match(health, /Cache-Control': 'no-store, max-age=0'/)
  assert.doesNotMatch(health, /SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|camper|invoice/i)
})

test('login is a semantic, keyboard-friendly form with an announced error', () => {
  assert.match(login, /<form[\s\S]*?onSubmit=/)
  assert.match(login, /type="submit"/)
  assert.match(login, /role="alert"/)
  assert.match(login, /aria-busy=\{loading\}/)
  assert.doesNotMatch(login, /console\.error\(err\)/)
})

test('password recovery always leaves the sending state after network errors', () => {
  assert.match(passwordReset, /try \{/)
  assert.match(passwordReset, /catch \{/)
  assert.match(passwordReset, /finally \{\s*setSending\(false\)/)
  assert.match(passwordReset, /<form[\s\S]*?onSubmit=/)
  assert.match(passwordReset, /role="status"/)
})
