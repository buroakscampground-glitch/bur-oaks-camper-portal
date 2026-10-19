import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/admin-documents/route.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../app/admin/documents/page.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

test('admin signature tracker includes the renewal response deadline', () => {
  assert.match(route, /renewalResponseDueDate/)
  assert.match(route, /renewal_document_id,contract_end_date/)
  assert.match(route, /response_due_date:/)
  assert.match(page, /signatureDateLabel\(document\.response_due_date\)/)
  assert.match(page, /Due \$\{responseDueDate\}/)
})

test('mobile signature actions stay together beneath the document details', () => {
  assert.match(styles, /\.signature-tracker-row-actions\{grid-column:2;justify-content:flex-start;flex-wrap:wrap\}/)
})
