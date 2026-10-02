import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dinnersPage = await readFile(new URL('../app/admin/dinners/page.tsx', import.meta.url), 'utf8')
const thanksgivingPage = await readFile(new URL('../app/admin/thanksgiving/page.tsx', import.meta.url), 'utf8')

test('admin dinner planning stays inside the admin workspace', () => {
  assert.match(dinnersPage, /\/admin\/thanksgiving/)
  assert.doesNotMatch(dinnersPage, /\/community\/thanksgiving/)
  assert.match(thanksgivingPage, /href="\/admin\/dinners"/)
  assert.doesNotMatch(thanksgivingPage, /href="\/community\/dinners"/)
})
