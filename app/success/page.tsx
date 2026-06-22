import Link from 'next/link'
import { ArrowRight, Check, CircleDollarSign, LockKeyhole, ReceiptText } from 'lucide-react'

export default function SuccessPage() {
  return (
    <main className="payment-result-page success">
      <section className="payment-result-shell">
        <a className="payment-result-brand" href="/portal">
          <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
          <span><strong>Bur Oaks</strong><small>Camper Portal</small></span>
        </a>

        <div className="payment-result-icon"><span><Check size={38} /></span></div>
        <div className="payment-result-eyebrow"><CircleDollarSign size={15} /> PAYMENT CONFIRMED</div>
        <h1>You’re all set.</h1>
        <p>Your payment was completed successfully. Your account balance will update in a moment.</p>

        <div className="payment-result-note">
          <ReceiptText size={21} />
          <div><strong>Payment received</strong><span>You can review the updated invoice and your full payment history from Billing & Payments.</span></div>
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
