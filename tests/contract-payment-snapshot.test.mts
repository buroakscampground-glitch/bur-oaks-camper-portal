import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { contractPaymentSnapshot } from '../lib/contract-payment-snapshot.ts'

const profileSource = readFileSync(new URL('../app/admin/campers/[id]/page.tsx', import.meta.url), 'utf8')

test('quarterly contract snapshot shows paid dates, next payment, money owed, and installments left', () => {
  const snapshot = contractPaymentSnapshot({
    annualRent: 1600,
    paymentPlan: 'quarterly',
    contractEndDate: '2027-05-01',
    today: '2026-09-23',
    invoices: [
      { id: 'rent-1', invoice_type: 'Quarterly Lot Rent', subtotal: 400, total_due: 400, due_date: '2026-05-01', status: 'Paid', paid_at: '2026-05-01T14:30:00Z', payment_method: 'Check' },
      { id: 'rent-2', invoice_type: 'Quarterly Lot Rent', subtotal: 400, total_due: 400, due_date: '2026-08-01', status: 'Paid', paid_at: '2026-08-04T14:30:00Z', payment_method: 'ACH', is_late: true },
      { id: 'rent-3', invoice_type: 'Quarterly Lot Rent', subtotal: 400, total_due: 400, due_date: '2026-11-01', status: 'Payment Due' },
      { id: 'electric', invoice_type: 'Electric', subtotal: 80, total_due: 80, due_date: '2026-10-01', status: 'Payment Due' },
    ],
  })

  assert.ok(snapshot)
  assert.equal(snapshot.contractStart, '2026-05-01')
  assert.equal(snapshot.contractEnd, '2027-05-01')
  assert.equal(snapshot.paidPayments, 2)
  assert.equal(snapshot.remainingPayments, 2)
  assert.equal(snapshot.paidAmount, 800)
  assert.equal(snapshot.remainingBalance, 800)
  assert.equal(snapshot.nextPayment?.dueDate, '2026-11-01')
  assert.equal(snapshot.entries[1].paidAt, '2026-08-04T14:30:00Z')
  assert.equal(snapshot.entries[1].isLate, true)
  assert.equal(snapshot.entries[3].status, 'Scheduled')
})

test('half-and-half contract uses the current rolling twelve-month term', () => {
  const snapshot = contractPaymentSnapshot({
    annualRent: 1500,
    paymentPlan: 'semiannual',
    contractEndDate: '2026-03-01',
    today: '2026-09-23',
    invoices: [],
  })

  assert.ok(snapshot)
  assert.equal(snapshot.contractStart, '2026-03-01')
  assert.equal(snapshot.contractEnd, '2027-03-01')
  assert.equal(snapshot.expectedPayments, 2)
  assert.equal(snapshot.remainingPayments, 2)
  assert.equal(snapshot.remainingBalance, 1500)
  assert.equal(snapshot.nextPayment?.dueDate, '2026-03-01')
})

test('cancelled rent and non-rent charges never change the contract balance', () => {
  const snapshot = contractPaymentSnapshot({
    annualRent: 1000,
    paymentPlan: 'semiannual',
    contractEndDate: '2027-01-08',
    today: '2026-09-23',
    invoices: [
      { id: 'cancelled', invoice_type: 'Lot Rent', subtotal: 500, due_date: '2026-01-08', status: 'Cancelled' },
      { id: 'power', invoice_type: 'Electric', subtotal: 500, due_date: '2026-01-08', status: 'Paid', paid_at: '2026-01-08' },
    ],
  })

  assert.ok(snapshot)
  assert.equal(snapshot.paidPayments, 0)
  assert.equal(snapshot.remainingBalance, 1000)
})

test('admin camper profile makes early-release decisions easy to reference', () => {
  assert.match(profileSource, /Contract payments at a glance/)
  assert.match(profileSource, /Paid toward contract/)
  assert.match(profileSource, /Next contract payment/)
  assert.match(profileSource, /Payments remaining/)
  assert.match(profileSource, /Office decision required if they ask to leave early/)
  assert.match(profileSource, /Open complete billing and payment history/)
})
