import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/admin/renewals/page.tsx', import.meta.url), 'utf8')

test('renewal forecast has separate sent and scheduled delivery views', () => {
  assert.match(source, /Renewals to be sent/)
  assert.match(source, /Renewals sent/)
  assert.match(source, /view === 'ToSend'/)
  assert.match(source, /view === 'Sent'/)
  assert.match(source, /row\.approvedToSend && !row\.renewal\?\.renewal_sent_at/)
  assert.match(source, /row\.renewal\?\.renewal_sent_at && !row\.campgroundDecision/)
})

test('delivery views show the appropriate send date in the roster', () => {
  assert.match(source, /view === 'Sent'[\s\S]*?'Renewal sent'/)
  assert.match(source, /view === 'ToSend'[\s\S]*?'Scheduled to send'/)
  assert.match(source, /row\.renewal\?\.renewal_sent_at \|\| ''/)
  assert.match(source, /view === 'ToSend'[\s\S]*?row\.sendDue/)
})
