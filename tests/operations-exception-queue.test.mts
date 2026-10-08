import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../lib/operations-health.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../app/admin/system-health/page.tsx', import.meta.url), 'utf8')

test('every System Health exception category has an accountable owner and next action', () => {
  const healthBlock = source.slice(source.indexOf('const health = ['), source.indexOf('const failures = ['))
  assert.equal((healthBlock.match(/key: '/g) || []).length, 8)
  assert.equal((healthBlock.match(/owner: '/g) || []).length, 8)
  assert.equal((healthBlock.match(/nextAction: '/g) || []).length, 8)
  assert.equal((healthBlock.match(/oldestOpenAt:/g) || []).length, 8)
})

test('the queue distinguishes open work from a verified clear state', () => {
  assert.match(page, /\$\{item\.count\} open · Owner:/)
  assert.match(page, /Oldest \$\{shortDate\(item\.oldestOpenAt\)\}/)
  assert.match(page, /Clear · No action needed/)
  assert.match(page, /Next: \{item\.nextAction\}/)
  assert.match(page, /open exceptions/)
})

test('exception links continue to lead to the exact office workspace', () => {
  for (const href of ['/admin/texts', '/admin/documents', '/admin/open-balance', '/admin/maintenance', '/admin/pump-outs', '/admin/messages', '/admin/campers']) {
    assert.match(source, new RegExp(href.replace('/', '\\/')))
  }
})
