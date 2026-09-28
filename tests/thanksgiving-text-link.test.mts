import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { portalPathForTextAlert } from '../lib/portal-sms-links.ts'

test('Thanksgiving promotional texts open the special signup directly', () => {
  assert.equal(portalPathForTextAlert('Thanksgiving Signup', 'Please RSVP'), '/thanksgiving')
  assert.equal(portalPathForTextAlert('Event Reminder', 'Bur Oaks Thanksgiving is Nov 7'), '/thanksgiving')
  assert.equal(portalPathForTextAlert('General Alert', 'Buroaksgiving signup is open'), '/thanksgiving')
})

test('the Text Alert Center offers a clear Thanksgiving preset and previews the same destination', async () => {
  const [adminSource, apiSource] = await Promise.all([
    readFile(new URL('../app/admin/texts/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/text-alerts/route.ts', import.meta.url), 'utf8'),
  ])

  assert.match(adminSource, /Thanksgiving Signup/)
  assert.match(adminSource, /Please RSVP and claim one food item/)
  assert.match(adminSource, /portalPathForTextAlert\(reminderType, message\)/)
  assert.match(apiSource, /portalPathForTextAlert\(reminderType, message\)/)
})
