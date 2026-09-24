import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('admins can open documents from a camper record and return to its documents tab', () => {
  const chrome = source('components/CamperChrome.tsx')
  const viewer = source('app/documents/view/[id]/page.tsx')
  const camper = source('app/admin/campers/[id]/page.tsx')

  assert.match(chrome, /isSharedDocumentViewerPath/)
  assert.match(chrome, /allowedRoles=\{\['camper', 'admin'\]\}/)
  assert.match(viewer, /admin\/campers\/\$\{encodeURIComponent\(viewer\.camperId\)\}\?history=documents#camper-history/)
  assert.match(camper, /new URLSearchParams\(window\.location\.search\)\.get\('history'\)/)
})

test('the secure viewer receives and displays saved signature details', () => {
  const route = source('app/api/document-url/route.ts')
  const viewer = source('app/documents/view/[id]/page.tsx')

  assert.match(route, /signed_name/)
  assert.match(route, /second_signed_name/)
  assert.match(route, /signature_record_hash/)
  assert.match(viewer, /SIGNED DOCUMENT · SECURE RECORD SAVED/)
  assert.match(viewer, /Signed by/)
})
