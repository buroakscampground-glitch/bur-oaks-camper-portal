import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('priority camper screens always leave their initial loading state', () => {
  for (const path of [
    'app/invoices/page.tsx',
    'app/messages/page.tsx',
    'app/documents/page.tsx',
    'app/maintenance/page.tsx',
    'app/portal/page.tsx',
  ]) {
    const source = read(path)
    assert.match(source, /finally \{\s*setLoading\(false\)/)
  }
})

test('failed startup loads provide safe retry guidance without implying a write', () => {
  const invoices = read('app/invoices/page.tsx')
  const messages = read('app/messages/page.tsx')
  const documents = read('app/documents/page.tsx')
  const maintenance = read('app/maintenance/page.tsx')
  const portal = read('app/portal/page.tsx')

  assert.match(invoices, /No payment was started/)
  assert.match(messages, /No message was sent or changed/)
  assert.match(documents, /Nothing was signed or changed/)
  assert.match(maintenance, /Nothing was submitted or changed/)

  for (const source of [invoices, messages, documents, maintenance, portal]) {
    assert.match(source, />Try again</)
    assert.match(source, /role="alert"/)
  }
})
