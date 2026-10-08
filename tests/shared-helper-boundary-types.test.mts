import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared camper, document, communication, printer, and meter helpers narrow external values', async () => {
  const files = await Promise.all([
    read('lib/camper-household.ts'),
    read('lib/camper-document-center.ts'),
    read('lib/community-staff-alerts.ts'),
    read('lib/sms-broadcast.ts'),
    read('lib/maintenance-completion-print-client.ts'),
    read('lib/meter-vision.ts'),
    read('app/api/bulk-portal-invites/route.ts'),
    read('app/api/admin-waitlist-convert/route.ts'),
  ])

  assert.match(files[0], /type CamperHouseholdProfile =/)
  assert.match(files[1], /type CamperDocumentSummary =/)
  assert.match(files[2], /type CommunityStaffCandidate =/)
  assert.match(files[3], /type SmsBroadcastCamper =/)
  assert.match(files[4], /catch \(error: unknown\)/)
  assert.match(files[5], /function responseText\(value: unknown\)/)
  assert.match(files[6], /type AuthenticatedContext =/)
  assert.match(files[6], /const inviteLogs = \(logs \|\| \[\]\) as InviteLog\[\]/)
  assert.match(files[7], /type RentInvoiceRow =/)
  assert.match(files[7], /const activeCamperRows = \(activeCampers \|\| \[\]\) as ActiveCamperSite\[\]/)
  for (const source of files) assert.doesNotMatch(source, /:\s*any\b|as\s+any\b|any\[\]/)
})
