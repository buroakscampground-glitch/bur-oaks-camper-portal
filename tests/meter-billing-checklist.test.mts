import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMonthlyBillingChecklist } from '../lib/meter-billing-checklist.ts'

test('monthly billing checklist groups shared profiles by lot and advances billing statuses', () => {
  const result = buildMonthlyBillingChecklist({
    lots: [
      { lot_number: '5', camper_id: 'primary-5' },
      { lot_number: '6', camper_id: 'primary-6' },
    ],
    campers: [
      { id: 'primary-5', first_name: 'Randy', last_name: 'Camper', lot_number: '5', role: 'camper', active: true },
      { id: 'second-5', first_name: 'Second', last_name: 'Login', lot_number: '5', role: 'camper', active: true },
      { id: 'primary-6', first_name: 'Jerry', last_name: 'Camper', lot_number: '6', role: 'camper', active: true },
      { id: 'test', first_name: 'Test', lot_number: '1001', role: 'camper', active: true },
    ],
    submissions: [
      { id: 'photo-5', lot_number: '5', detected_reading: 1234, status: 'pending', captured_at: '2026-08-28T10:00:00Z' },
    ],
    invoices: [
      { id: 'invoice-6', camper_id: 'primary-6', status: 'paid', created_at: '2026-08-28T11:00:00Z' },
    ],
  })

  assert.equal(result.entries.length, 2)
  assert.equal(result.entries.find((item) => item.lot_number === '5')?.status, 'photo_ready')
  assert.equal(result.entries.find((item) => item.lot_number === '6')?.status, 'paid')
  assert.deepEqual(result.counts, { not_read: 0, photo_ready: 1, needs_retake: 0, invoice_created: 0, paid: 1 })
})
