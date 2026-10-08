import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const invoiceList = await readFile(new URL('../app/admin/invoices/page.tsx', import.meta.url), 'utf8')
const invoiceDetail = await readFile(new URL('../app/admin/invoices/[id]/page.tsx', import.meta.url), 'utf8')
const adminHome = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8')

test('admin home and every open invoice expose a clear Record check path', () => {
  assert.match(adminHome, /invoices\?filter=open&amp;payment=check|invoices\?filter=open&payment=check/)
  assert.match(adminHome, /> Record check</)
  assert.match(invoiceList, /\?payment=check#record-office-payment/)
  assert.match(invoiceList, /'Record check'/)
})

test('direct check entry selects Check and focuses the amount without bypassing payment guards', () => {
  assert.match(invoiceDetail, /useState\('Check'\)/)
  assert.match(invoiceDetail, /get\('payment'\) === 'check'/)
  assert.match(invoiceDetail, /office-payment-amount/)
  assert.match(invoiceDetail, /isInvoicePaid\(invoice\).*isInvoiceClosed\(invoice\).*normalizedInvoiceStatus\(invoice\) === 'processing'/s)
  assert.match(invoiceDetail, /submitManualPayment\(\{/)
})

test('check entry keeps amount, date, reference, reason, allocation preview, and confirmation', () => {
  for (const label of ['Amount received', 'Payment method', 'Date received', 'Check or reference number', 'Reason / office note', 'Automatic allocation']) {
    assert.match(invoiceDetail, new RegExp(label))
  }
  assert.match(invoiceDetail, /manualPaymentReason\.trim\(\)\.length < 5/)
  assert.match(invoiceDetail, /Record and apply check/)
})
