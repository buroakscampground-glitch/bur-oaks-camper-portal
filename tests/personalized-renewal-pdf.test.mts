import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { createPersonalizedRenewalPdf, renewalTermDates } from '../lib/personalized-renewal-pdf.ts'

test('a personalized renewal is one readable page with a site-specific annual rate', async () => {
  const dates = renewalTermDates('2027-02-01')
  const bytes = await createPersonalizedRenewalPdf({
    camperName: 'Clairice Marshall',
    lotNumber: '18',
    currentAgreementEnd: '2027-02-01',
    renewalStart: dates.renewalStart,
    renewalEnd: dates.renewalEnd,
    annualRent: 1600,
    paymentPlan: 'semiannual',
  })
  const document = await PDFDocument.load(bytes)
  assert.equal(document.getPageCount(), 1)
  assert.ok(bytes.length > 2000)
})

test('a renewal cannot be generated with a blank or zero annual rate', async () => {
  const dates = renewalTermDates('2026-10-10')
  await assert.rejects(() => createPersonalizedRenewalPdf({
    camperName: 'Clairice Marshall',
    lotNumber: 'TEMP 1',
    currentAgreementEnd: '2026-10-10',
    renewalStart: dates.renewalStart,
    renewalEnd: dates.renewalEnd,
    annualRent: 0,
    paymentPlan: 'semiannual',
  }), /annual lot rent/i)
})
