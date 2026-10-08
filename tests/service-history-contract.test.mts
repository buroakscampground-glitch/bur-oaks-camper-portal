import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../app/maintenance/page.tsx', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/sewer-pump-out/route.ts', import.meta.url), 'utf8')

test('camper service history combines maintenance and pump-outs without mutating either record', () => {
  assert.match(page, /My Service Timeline/)
  assert.match(page, /camperPumpOutStatus/)
  assert.match(page, /Promise\.all/)
  assert.doesNotMatch(page, /fetch\('\/api\/sewer-pump-out',\s*\{[^}]*method:\s*'POST'/s)
  assert.match(route, /\.limit\(100\)/)
})
