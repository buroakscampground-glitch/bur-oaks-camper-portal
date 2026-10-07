import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('document signing and non-renewal actions block rapid duplicate taps', () => {
  const page = read('app/documents/page.tsx')
  assert.match(page, /if \(signingRef\.current\) return/)
  assert.match(page, /signingRef\.current = true/)
  assert.match(page, /if \(decliningRef\.current\) return/)
  assert.match(page, /decliningRef\.current = documentId/)
})

test('uncertain document actions reconcile authoritative state before retrying', () => {
  const page = read('app/documents/page.tsx')
  assert.match(page, /refreshDocumentState/)
  assert.match(page, /could not confirm whether your signature was recorded/)
  assert.match(page, /could not confirm whether your decision was recorded/)
  assert.match(page, /role="status" aria-live="polite"/)
})

test('repeated non-renewal decisions do not send duplicate office alerts', () => {
  const route = read('app/api/renewal-decision/route.ts')
  const guardIndex = route.indexOf("renewal.status === 'Camper Leaving'")
  const notificationIndex = route.indexOf("type: 'renewal_declined'")
  assert.ok(guardIndex > 0)
  assert.ok(notificationIndex > guardIndex)
  assert.match(route, /duplicate: true/)
})
