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
  assert.deepEqual(result.counts, { not_read: 0, photo_ready: 1, needs_retake: 0, no_bill: 0, invoice_created: 0, paid: 1 })
})

test('monthly billing checklist treats a saved zero-usage reading as complete without an invoice', () => {
  const result = buildMonthlyBillingChecklist({
    lots: [{ lot_number: '19', camper_id: 'camper-19' }],
    campers: [{ id: 'camper-19', first_name: 'No', last_name: 'Usage', lot_number: '19', role: 'camper', active: true }],
    submissions: [{
      id: 'photo-19',
      camper_id: 'camper-19',
      lot_number: '19',
      status: 'used',
      reviewed_reading: 14318,
      invoice_id: null,
      ocr_text: JSON.stringify({ office_completion: 'no_usage' }),
      captured_at: '2026-08-31T10:00:00Z',
    }],
    invoices: [],
  })

  assert.equal(result.entries[0]?.status, 'no_bill')
  assert.deepEqual(result.counts, { not_read: 0, photo_ready: 0, needs_retake: 0, no_bill: 1, invoice_created: 0, paid: 0 })
})
