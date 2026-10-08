import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('System Health uses the production document upload timestamp', () => {
  const source = read('lib/operations-health.ts')
  const documentQuery = source.match(/client\.from\('documents'\)\.select\(([^\n]+)\)/)?.[0] || ''

  assert.match(documentQuery, /uploaded_at/)
  assert.doesNotMatch(documentQuery, /created_at/)
  assert.match(source, /oldestDate\(unsignedDocuments, 'uploaded_at'\)/)
})

test('camper and office document dates come from documents.uploaded_at', () => {
  const profile = read('app/profile/page.tsx')
  const camper = read('app/admin/campers/[id]/page.tsx')
  const history = read('app/api/admin-site-history/route.ts')

  assert.match(profile, /document\.uploaded_at/)
  assert.doesNotMatch(profile, /document\.created_at/)
  assert.match(camper, /document\.uploaded_at/)
  assert.doesNotMatch(camper, /document\.created_at/)
  assert.match(history, /signature_status,uploaded_at,signed_at/)
  assert.match(history, /item\.signed_at \|\| item\.uploaded_at \|\| null/)
})
