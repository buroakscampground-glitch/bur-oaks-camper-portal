import Link from 'next/link'
import { ArrowLeft, CreditCard, ReceiptText, RefreshCcw, ShieldCheck, X } from 'lucide-react'

export default function CancelPage() {
  return (
    <main className="payment-result-page cancelled">
      <section className="payment-result-shell">
        <a className="payment-result-brand" href="/portal">
          <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
          <span><strong>Bur Oaks</strong><small>Camper Portal</small></span>
        </a>

        <div className="payment-result-icon"><span><X size={34} /></span></div>
        <div className="payment-result-eyebrow"><CreditCard size={15} /> CHECKOUT CLOSED</div>
        <h1>No payment was made.</h1>
        <p>Your checkout was cancelled and your card was not charged. Your invoice remains open.</p>

        <div className="payment-result-note">
          <ShieldCheck size={21} />
          <div><strong>Nothing changed</strong><span>You can return to billing whenever you are ready and try the payment again.</span></div>
        </div>

        <div className="payment-result-next">
          <article>
            <ReceiptText size={18} />
            <strong>Invoice still open</strong>
            <small>The balance stays on your account until it is paid or marked paid by the office.</small>
          </article>
          <article>
            <ShieldCheck size={18} />
            <strong>No card charge</strong>
            <small>Closing checkout does not run a payment or change your saved billing information.</small>
          </article>
          <article>
            <RefreshCcw size={18} />
            <strong>Try again anytime</strong>
            <small>You can come back from Billing & Payments when you are ready.</small>
          </article>
        </div>

        <div className="payment-result-actions">
          <Link className="payment-result-primary" href="/invoices"><ArrowLeft size={17} /> Return to billing</Link>
          <Link className="payment-result-secondary" href="/portal">Return to portal</Link>
        </div>
      </section>
    </main>
  )
}
