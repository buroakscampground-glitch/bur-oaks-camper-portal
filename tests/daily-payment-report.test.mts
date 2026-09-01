import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { buildDailyPaymentPdf } from '../lib/daily-payment-report.ts'

function payment(index: number) {
  return {
    id: String(index),
    invoice_number: `INV-${1000 + index}`,
    invoice_type: index % 2 ? 'Quarterly Lot Rent' : 'Electric + Water/Trash',
    total_due: 25 + index,
    payment_method: index % 2 ? 'ACH / checking account' : 'Card',
    paid_at: `2026-08-31T${String(12 + (index % 10)).padStart(2, '0')}:15:00.000Z`,
    campers: { first_name: 'Test', last_name: `Camper ${index}`, lot_number: String(index + 1) },
  }
}

test('daily payment PDF paginates a clear register at twelve payments per page', async () => {
  const bytes = await buildDailyPaymentPdf(Array.from({ length: 14 }, (_, index) => payment(index)), '2026-08-31')
  const pdf = await PDFDocument.load(bytes)
  assert.equal(pdf.getPageCount(), 2)
  assert.equal(pdf.getTitle(), 'Bur Oaks Daily Payments - 2026-08-31')
})

test('daily payment PDF still creates a no-payment accountability sheet', async () => {
  const bytes = await buildDailyPaymentPdf([], '2026-08-31')
  const pdf = await PDFDocument.load(bytes)
  assert.equal(pdf.getPageCount(), 1)
})
