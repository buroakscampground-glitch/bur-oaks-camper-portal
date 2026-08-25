import assert from 'node:assert/strict'
import test from 'node:test'
import { nextInvoiceNumber } from '../lib/invoice-number.ts'
import { isCompletedTicketStatus } from '../lib/maintenance-status.ts'
import { filterOptedInPhones } from '../lib/sms-recipient-filter.ts'

test('completed maintenance statuses are matched without case or whitespace sensitivity', () => {
  assert.equal(isCompletedTicketStatus('completed'), true)
  assert.equal(isCompletedTicketStatus(' Closed '), true)
  assert.equal(isCompletedTicketStatus('In Progress'), false)
})

test('invoice previews ignore unrelated and malformed invoice numbers', () => {
  const date = new Date(2026, 7, 25)
  assert.equal(nextInvoiceNumber([
    { invoice_number: 'INV-20260825-001' },
    { invoice_number: 'INV-20260825-009' },
    { invoice_number: 'ELECTRIC-12-123' },
  ], date), 'INV-20260825-010')
})

test('SMS recipients include only individually opted-in saved phones', () => {
  const recipients = filterOptedInPhones(
    ['+16185550101', '+16185550102'],
    [
      { phone_number: '+16185550101', opted_in: true },
      { phone_number: '+16185550102', opted_in: false },
    ]
  )
  assert.deepEqual(recipients, ['+16185550101'])
})
