import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const guard = await readFile(new URL('../components/RoleGuard.tsx', import.meta.url), 'utf8')

test('a valid account in the wrong workspace receives an explanation instead of a silent redirect', () => {
  assert.match(guard, /RIGHT PERSON · WRONG WORKSPACE/)
  assert.match(guard, /cannot open this page/)
  assert.match(guard, /You are still safely signed in/)
  assert.doesNotMatch(guard, /window\.location\.replace\(destination\)/)
})

test('authorization remains closed until the required role is verified', () => {
  assert.match(guard, /allowedRolesKey\.split\(','\)\.includes\(role\)/)
  assert.match(guard, /if \(!allowed\)/)
  assert.match(guard, /return <>{children}<\/?>/)
})

test('switching accounts requires an explicit click and preserves the protected return path', () => {
  assert.match(guard, /onClick=\{switchAccount\}/)
  assert.match(guard, /await supabase\.auth\.signOut\(\)/)
  assert.match(guard, /returnTo=\$\{encodeURIComponent\(returnTo\)\}/)
  assert.match(guard, /reason=wrong-account/)
  assert.match(guard, /no account information was changed/)
})
