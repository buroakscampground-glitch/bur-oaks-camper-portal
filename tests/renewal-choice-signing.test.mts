import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const documentsPage = await readFile(new URL('../app/documents/page.tsx', import.meta.url), 'utf8')
const signingRoute = await readFile(new URL('../app/api/sign-document/route.ts', import.meta.url), 'utf8')

test('renewal signing uses real Yes and No controls outside the read-only PDF', () => {
  assert.match(documentsPage, /Are you renewing Lot/)
  assert.match(documentsPage, /value="renew"/)
  assert.match(documentsPage, /value="not-renew"/)
  assert.match(documentsPage, /PDF preview below is read-only/)
  assert.match(documentsPage, /renewalDecision === 'renew'/)
})

test('the server requires an explicit Yes decision before accepting a renewal signature', () => {
  assert.match(signingRoute, /renewalDecision !== 'renew'/)
  assert.match(signingRoute, /Select Yes to confirm that you are renewing this site before signing/)
  assert.match(signingRoute, /decision: 'renew'/)
})
