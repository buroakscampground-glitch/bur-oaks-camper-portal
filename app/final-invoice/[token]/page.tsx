'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, CreditCard, Hourglass, LockKeyhole, Printer, ReceiptText, WalletCards } from 'lucide-react'
import { achProcessingFeeLabel } from '../../../lib/payment-fees'
import type { InvoicePaymentMethod } from '../../../lib/stripe'
import { printPageWithFlag } from '../../../lib/print-page'

function money(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function date(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function FinalInvoicePage() {
  const token = String(useParams().token || '')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [paying, setPaying] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<InvoicePaymentMethod>('card')

  async function loadInvoice() {
    const response = await fetch(`/api/final-invoice?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    setResult(data)
    setLoading(false)
  }

  useEffect(() => {
    loadInvoice()
    const timer = window.setInterval(loadInvoice, 30_000)
    window.addEventListener('focus', loadInvoice)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', loadInvoice)
    }
  }, [token])

  async function pay() {
    setPaying(true)
    setMessage('')
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finalInvoiceToken: token, paymentMethod }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data?.url) {
      setMessage(data?.error || 'Unable to open secure checkout. The invoice may already be paid.')
      setPaying(false)
      await loadInvoice()
      return
    }
    window.location.href = data.url
  }

  if (loading) {
    return <main className="final-invoice-page"><section className="final-invoice-state"><ReceiptText size={34} /><h1>Opening your final invoice…</h1></section></main>
  }

  if (!result?.invoice) {
    return (
      <main className="final-invoice-page">
        <section className="final-invoice-state">
          {result?.paid ? <CheckCircle2 size={38} /> : <LockKeyhole size={38} />}
          <span>BUR OAKS FINAL BILLING</span>
          <h1>{result?.paid ? 'Payment complete' : 'Payment link closed'}</h1>
          <p>{result?.message || 'This final-invoice link is no longer available.'}</p>
          <small>Contact the Bur Oaks office if you have any questions.</small>
        </section>
      </main>
    )
  }

  const invoice = result.invoice
  const camper = result.camper
  const processing = String(invoice.status || '').toLowerCase() === 'processing'
  const fee = paymentMethod === 'ach' ? Number(result.payment.achFee || 0) : Number(result.payment.cardFee || 0)
  const total = Number(invoice.total_due || 0) + fee

  return (
    <main className="final-invoice-page">
      <section className="final-invoice-shell">
        <header className="final-invoice-hero">
          <div><span><LockKeyhole size={15} /> FINAL BILLING · PAYMENT ACCESS ONLY</span><h1>Invoice #{invoice.invoice_number}</h1><p>Lot {camper.lot_number || '—'} · {camper.first_name} {camper.last_name}</p></div>
          <button type="button" onClick={() => printPageWithFlag('data-print-final-invoice')}><Printer size={16} /> Print Invoice</button>
        </header>

        <section className="final-invoice-summary">
          <article><small>Status</small><strong>{processing ? 'Bank payment processing' : 'Payment due'}</strong></article>
          <article><small>Due date</small><strong>{date(invoice.due_date)}</strong></article>
          <article><small>Invoice balance</small><strong>{money(invoice.total_due)}</strong></article>
        </section>

        <section className="final-invoice-card">
          <div className="final-invoice-heading"><div><small>ITEMIZED FINAL CHARGES</small><h2>{invoice.invoice_type || 'Final campground invoice'}</h2></div><ReceiptText size={25} /></div>
          <div className="final-invoice-items">
            {(invoice.invoice_items || []).map((item: any) => (
              <article key={item.id}><div><strong>{item.description || 'Invoice charge'}</strong><small>Qty {Number(item.quantity || 1).toLocaleString()} × {money(item.unit_price)}</small></div><span>{money(item.total)}</span></article>
            ))}
          </div>

          {!processing && (
            <div className="final-invoice-methods">
              <strong>Choose how to pay securely</strong>
              <div>
                <button type="button" className={paymentMethod === 'card' ? 'active' : ''} onClick={() => setPaymentMethod('card')}><CreditCard size={17} /> Card</button>
                <button type="button" className={paymentMethod === 'ach' ? 'active' : ''} onClick={() => setPaymentMethod('ach')}><WalletCards size={17} /> Checking / ACH</button>
              </div>
            </div>
          )}

          <div className="final-invoice-total">
            <p><span>Invoice balance</span><strong>{money(invoice.total_due)}</strong></p>
            {!processing && <p><span>{paymentMethod === 'ach' ? achProcessingFeeLabel : result.payment.cardFeeLabel}</span><strong>{money(fee)}</strong></p>}
            <p className="grand"><span>{processing ? 'Amount processing' : 'Total charged today'}</span><strong>{money(processing ? invoice.total_due : total)}</strong></p>
          </div>

          {processing ? (
            <div className="final-invoice-processing"><Hourglass size={19} /><span><strong>Bank payment processing</strong><small>This payment link cannot be used again while the ACH payment is processing.</small></span></div>
          ) : (
            <button className="final-invoice-pay" type="button" onClick={pay} disabled={paying}><LockKeyhole size={17} /> {paying ? 'Opening secure checkout…' : `Pay ${money(total)} by ${paymentMethod === 'ach' ? 'ACH' : 'card'}`}</button>
          )}
          {message && <p className="final-invoice-message">{message}</p>}
          <p className="final-invoice-security">This private link opens only this final invoice. It does not restore camper-portal access and automatically closes when the invoice is paid online or marked paid by the office.</p>
        </section>
      </section>
    </main>
  )
}
