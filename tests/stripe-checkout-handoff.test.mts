import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const stripeClient = await readFile(new URL('../lib/stripe.ts', import.meta.url), 'utf8')
const reviewDialog = await readFile(new URL('../app/components/payment-review-dialog.tsx', import.meta.url), 'utf8')
const invoiceList = await readFile(new URL('../app/invoices/page.tsx', import.meta.url), 'utf8')
const invoiceDetail = await readFile(new URL('../app/invoices/[id]/page.tsx', import.meta.url), 'utf8')

test('card checkout keeps a direct Stripe link when automatic navigation does not leave the page', () => {
  assert.match(stripeClient, /window\.location\.assign\(session\.url\)/)
  assert.match(stripeClient, /return session/)
  assert.match(reviewDialog, /checkoutUrl\?: string/)
  assert.match(reviewDialog, /<a className="primary" href=\{checkoutUrl\}>/)
  assert.match(reviewDialog, /Open secure \{isAch \? 'bank' : 'card'\} form/)
  assert.match(invoiceList, /setCheckoutRecoveryUrl\(session\.url\)/)
  assert.match(invoiceDetail, /setCheckoutRecoveryUrl\(session\.url\)/)
})

test('camper payment screens explain that selecting Card is followed by a pay button', () => {
  assert.match(invoiceList, /Card selected\. Tap Pay by card on the bill below/)
  assert.match(invoiceList, /'Pay by card'/)
  assert.match(invoiceDetail, /Card selected\. Tap Pay by card below/)
})
