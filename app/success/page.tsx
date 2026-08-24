import Link from 'next/link'
import { ArrowRight, Check, CircleDollarSign, Home, LockKeyhole, ReceiptText, Sparkles } from 'lucide-react'

export default function SuccessPage() {
  return (
    <main className="payment-result-page success">
      <section className="payment-result-shell">
        <a className="payment-result-brand" href="/portal">
          <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
          <span><strong>Bur Oaks</strong><small>Camper Portal</small></span>
        </a>

        <div className="payment-result-icon"><span><Check size={38} /></span></div>
        <div className="payment-result-eyebrow"><CircleDollarSign size={15} /> PAYMENT SUBMITTED</div>
        <h1>Your payment is on its way.</h1>
        <p>Stripe received your payment. Card payments usually confirm immediately; ACH bank payments can take several business days.</p>

        <div className="payment-result-note">
          <ReceiptText size={21} />
          <div><strong>Payment submitted securely</strong><span>You can review the invoice and its current payment status from Billing & Payments.</span></div>
        </div>

        <div className="payment-result-next">
          <article>
            <ReceiptText size={18} />
            <strong>Receipt updated</strong>
            <small>Your portal will show the paid status as soon as Stripe confirms it.</small>
          </article>
          <article>
            <Home size={18} />
            <strong>Back to camp life</strong>
            <small>Weather, events, dinners, requests, and messages are waiting on your home page.</small>
          </article>
          <article>
            <Sparkles size={18} />
            <strong>Less paper, less chasing</strong>
            <small>ACH and AutoPay options can help make future bills easier.</small>
          </article>
        </div>

        <div className="payment-result-actions">
          <Link className="payment-result-primary" href="/invoices">View billing & payments <ArrowRight size={17} /></Link>
          <Link className="payment-result-secondary" href="/portal">Return to portal</Link>
        </div>

        <small className="payment-result-security"><LockKeyhole size={13} /> Payment processed securely by Stripe</small>
      </section>
    </main>
  )
}
