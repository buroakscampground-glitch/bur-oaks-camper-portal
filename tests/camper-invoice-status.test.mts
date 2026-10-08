import assert from 'node:assert/strict'
import test from 'node:test'
import { camperInvoiceStatus } from '../lib/camper-invoice-status.ts'

const today = '2026-10-08'

test('camper invoices use one plain-language status vocabulary', () => {
  assert.equal(camperInvoiceStatus({ status: 'paid', payment_method: 'Online card' }, today).label, 'Paid')
  assert.equal(camperInvoiceStatus({ status: 'paid', payment_method: 'Paid by account credit' }, today).label, 'Credited')
  assert.equal(camperInvoiceStatus({ status: 'processing', due_date: '2026-10-01' }, today).label, 'Processing')
  assert.equal(camperInvoiceStatus({ status: 'canceled', due_date: '2026-10-01' }, today).label, 'Canceled')
  assert.equal(camperInvoiceStatus({ status: 'sent', due_date: '2026-10-01' }, today).label, 'Needs attention')
  assert.equal(camperInvoiceStatus({ status: 'sent', due_date: today }, today).label, 'Due now')
  assert.equal(camperInvoiceStatus({ status: 'sent', due_date: '2026-10-15' }, today).label, 'Due soon')
  assert.equal(camperInvoiceStatus({ status: 'sent', due_date: '2027-01-01' }, today).label, 'Scheduled')
})

test('status details explain action without encouraging a duplicate payment', () => {
  assert.match(camperInvoiceStatus({ status: 'processing', due_date: '2026-10-01' }, today).detail, /do not pay again/i)
  assert.match(camperInvoiceStatus({ status: 'sent', due_date: '2026-10-07' }, today).detail, /Past due by 1 day/)
  assert.match(camperInvoiceStatus({ status: 'sent', due_date: null }, today).detail, /Contact Bur Oaks before paying/)
})

