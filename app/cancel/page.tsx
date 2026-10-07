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
        <h1>Checkout was closed.</h1>
        <p>Stripe returned you before showing a completed checkout here. Check Billing &amp; Payments for the invoice's current status before trying again.</p>

        <div className="payment-result-note">
          <ShieldCheck size={21} />
          <div><strong>Check before retrying</strong><span>If the invoice is Open, you can try again. If it says Processing or Paid, do not submit another payment.</span></div>
        </div>

        <div className="payment-result-next">
          <article>
            <ReceiptText size={18} />
            <strong>Invoice status is authoritative</strong>
            <small>Return to Billing &amp; Payments to see whether the invoice is Open, Processing, or Paid.</small>
          </article>
          <article>
            <ShieldCheck size={18} />
            <strong>Avoid a duplicate</strong>
            <small>Do not start another checkout when the invoice already says Processing or Paid.</small>
          </article>
          <article>
            <RefreshCcw size={18} />
            <strong>Retry only if Open</strong>
            <small>If the invoice remains Open, the secure checkout can be opened again.</small>
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
