'use client'

import { useEffect } from 'react'
import { ArrowLeft, CreditCard, LockKeyhole, WalletCards, X } from 'lucide-react'
import type { ExtraPaymentDestination, InvoicePaymentMethod } from '../../lib/stripe'

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function PaymentReviewDialog({
  open, paymentMethod, invoiceCount, invoiceTotal, extraAmount, extraDestination,
  processingFee, chargeTotal, loading, onCancel, onConfirm,
}: {
  open: boolean
  paymentMethod: InvoicePaymentMethod
  invoiceCount: number
  invoiceTotal: number
  extraAmount: number
  extraDestination: ExtraPaymentDestination
  processingFee: number
  chargeTotal: number
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [loading, onCancel, open])

  if (!open) return null

  const isAch = paymentMethod === 'ach'
  return (
    <div className="payment-review-backdrop" role="presentation">
      <section className="payment-review-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-review-title">
        <header>
          <span>{isAch ? <WalletCards /> : <CreditCard />}</span>
          <div><small>FINAL CHECK BEFORE STRIPE</small><h2 id="payment-review-title">Review your payment</h2></div>
          <button type="button" onClick={onCancel} disabled={loading} aria-label="Close payment review"><X /></button>
        </header>
        <div className="payment-review-lines">
          <p><span>{invoiceCount} invoice{invoiceCount === 1 ? '' : 's'}</span><strong>{money(invoiceTotal)}</strong></p>
          {extraAmount > 0 && <p><span>Extra saved for {extraDestination === 'lot_rent' ? 'future lot rent' : 'any future bill'}</span><strong>{money(extraAmount)}</strong></p>}
          <p><span>{isAch ? 'ACH processing fee' : 'Card processing fee'}</span><strong>{money(processingFee)}</strong></p>
          <p className="total"><span>{isAch ? 'Total bank debit' : 'Total Stripe will charge today'}</span><strong>{money(chargeTotal)}</strong></p>
        </div>
        <div className="payment-review-expectation">
          <strong>{isAch ? 'What happens next' : 'Ready for secure card checkout'}</strong>
          <p>{isAch
            ? 'Stripe will securely collect your bank details. Your invoice will show Processing—do not pay again—until the bank confirms it.'
            : 'Stripe will securely collect your card details. After Stripe confirms payment, Billing & Payments will show the paid invoice and receipt.'}</p>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onCancel} disabled={loading}><ArrowLeft /> Go back</button>
          <button type="button" className="primary" onClick={onConfirm} disabled={loading}><LockKeyhole /> {loading ? 'Opening Stripe…' : `Continue to Stripe · ${money(chargeTotal)}`}</button>
        </footer>
        <small className="payment-review-security">Bur Oaks never sees or stores your full card or bank-account number.</small>
      </section>
    </div>
  )
}
