import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dinnersPage = await readFile(new URL('../app/admin/dinners/page.tsx', import.meta.url), 'utf8')
const thanksgivingPage = await readFile(new URL('../app/admin/thanksgiving/page.tsx', import.meta.url), 'utf8')

test('shared dinner planning keeps admins and event coordinators inside their own workspaces', () => {
  assert.match(dinnersPage, /pathname\.startsWith\('\/community'\)/)
  assert.match(dinnersPage, /'\/community\/thanksgiving' : '\/admin\/thanksgiving'/)
  assert.match(dinnersPage, /window\.location\.href = thanksgivingPlannerPath/)
  assert.match(dinnersPage, /href=\{thanksgivingPlannerPath\}/)

  assert.match(thanksgivingPage, /pathname\.startsWith\('\/community'\)/)
  assert.match(thanksgivingPage, /'\/community\/dinners' : '\/admin\/dinners'/)
  assert.match(thanksgivingPage, /href=\{dinnersPath\}/)
})
