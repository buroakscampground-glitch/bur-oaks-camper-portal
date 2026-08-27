import assert from 'node:assert/strict'
import test from 'node:test'
import { nextInvoiceNumber } from '../lib/invoice-number.ts'
import { isCompletedTicketStatus } from '../lib/maintenance-status.ts'
import { filterOptedInPhones } from '../lib/sms-recipient-filter.ts'
import { createFinalInvoiceToken, verifyFinalInvoiceToken } from '../lib/final-invoice-token.ts'
import { buildNonRenewalLetter } from '../lib/nonrenewal-letter-copy.ts'

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

test('final invoice tokens are scoped, signed, and expire', () => {
  const secret = 'test-final-invoice-secret'
  const issuedAt = Date.UTC(2026, 7, 26)
  const token = createFinalInvoiceToken('invoice-123', 'camper-456', {
    now: issuedAt,
    lifetimeSeconds: 60,
    secret,
  })

  assert.deepEqual(
    verifyFinalInvoiceToken(token, { now: issuedAt + 30_000, secret }),
    {
      version: 1,
      invoiceId: 'invoice-123',
      camperId: 'camper-456',
      expiresAt: Math.floor(issuedAt / 1000) + 60,
    }
  )
  assert.equal(verifyFinalInvoiceToken(`${token}changed`, { now: issuedAt, secret }), null)
  assert.equal(verifyFinalInvoiceToken(token, { now: issuedAt + 61_000, secret }), null)
})

test('campground non-renewal letters name both profiles and use the lease end date', () => {
  const letter = buildNonRenewalLetter({
    first_name: 'Sally',
    second_profile_first_name: 'Dave',
    last_name: 'Camper',
    lot_number: 'FF3',
  }, '2027-05-01')

  assert.match(letter.text, /Dear Sally and Dave,/)
  assert.match(letter.text, /Site FF3/)
  assert.match(letter.text, /May 1, 2027/)
  assert.match(letter.text, /camping-ready condition/)
  assert.match(letter.text, /rock or stone, landscaping, bushes, trees/)
  assert.match(letter.text, /property of Bur Oaks Campground/)
  assert.match(letter.text, /may be charged to your account/)
})
