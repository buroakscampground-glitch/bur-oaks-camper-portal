import assert from 'node:assert/strict'
import test from 'node:test'
import { isConvertedSiteCareTicket, maintenanceTaskForDisplay } from '../lib/maintenance-ticket-display.ts'

test('converted site care shows only the maintenance task, not the camper notice', () => {
  const ticket = {
    title: 'Site care deadline — weed eat site',
    description: 'Please weed eat around your camper and shed. The camper did not acknowledge this notice. Site care notice 12345678-1234-1234-1234-123456789012',
    reported_by: 'Automatic site care enforcement',
  }
  assert.equal(isConvertedSiteCareTicket(ticket), true)
  assert.equal(maintenanceTaskForDisplay(ticket), 'Weed eat around the campsite.')
})

test('ordinary maintenance tickets keep their original description', () => {
  assert.equal(maintenanceTaskForDisplay({ title: 'Fix faucet', description: 'Replace the leaking valve.' }), 'Replace the leaking valve.')
})
