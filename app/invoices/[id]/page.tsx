'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
  Printer,
  ReceiptText,
} from 'lucide-react'
import { useParams } from 'next/navigation'
import { getCurrentCamper, supabase } from '../../../lib/supabase'
import { checkoutItems } from '../../../lib/stripe'
import { fallbackInvoiceLine, invoiceLineDetails } from '../../../lib/invoice-display'

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function formatDate(value?: string) {
  if (!value) return 'No due date'

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function CamperInvoiceDetailPage() {
  const params = useParams()
  const invoiceId = String(params.id || '')
  const [camper, setCamper] = useState<any>(null)
  const [invoice, setInvoice] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadInvoice() {
      const camperData = await getCurrentCamper()

      if (!camperData) {
        window.location.href = '/login'
        return
      }

      setCamper(camperData)

      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('id', invoiceId)
        .eq('camper_id', camperData.id)
        .maybeSingle()

      if (error) setMessage(error.message)
      setInvoice(data || null)
      setItems(Array.isArray(data?.invoice_items) ? data.invoice_items : [])
      setLoading(false)
    }

    loadInvoice()
  }, [invoiceId])

  async function payInvoice() {
    if (!invoice) return

    setPaying(true)
    setMessage('')

    try {
      await checkoutItems(
        [
          {
            name: `Invoice ${invoice.invoice_number}`,
            amount: Math.round(Number(invoice.total_due || 0) * 100),
            currency: 'usd',
            quantity: 1,
          },
        ],
        `${window.location.origin}/success`,
        `${window.location.origin}/invoices`,
        [invoice.id],
      )
    } catch (error: any) {
      setMessage(error.message || 'Unable to start secure checkout.')
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <main className="camper-invoice-detail-page">
        <section className="camper-invoice-detail-empty">
          <ReceiptText size={30} />
          <p>Opening invoice…</p>
        </section>
      </main>
    )
  }

  if (!invoice) {
    return (
      <main className="camper-invoice-detail-page">
        <section className="camper-invoice-detail-empty">
          <ReceiptText size={30} />
          <h1>Invoice not found</h1>
          <p>{message || 'This invoice is not available for your camper account.'}</p>
          <a href="/invoices"><ArrowLeft size={16} /> Back to invoices</a>
        </section>
      </main>
    )
  }

  const isPaid = invoice.status === 'paid'
  const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0)
  const visibleItemLines = items.length
    ? items.map((item) => ({
        key: item.id || item.description,
        quantity: Number(item.quantity || 1),
        unitPrice: item.unit_price,
        ...invoiceLineDetails(item),
      }))
    : [{ key: 'fallback', quantity: 1, unitPrice: invoice.total_due, ...fallbackInvoiceLine(invoice) }]

  return (
    <main className="camper-invoice-detail-page">
      <section className="camper-invoice-detail-shell">
        <header className="camper-invoice-detail-hero">
          <a href="/invoices"><ArrowLeft size={16} /> Back to invoices</a>
          <div>
            <span><ReceiptText size={16} /> BUR OAKS INVOICE</span>
            <h1>Invoice #{invoice.invoice_number}</h1>
            <p>Lot {camper?.lot_number || '—'} · {camper?.first_name} {camper?.last_name}</p>
          </div>
          <button type="button" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
        </header>

        <section className="camper-invoice-detail-summary">
          <article>
            <small>Status</small>
            <strong className={isPaid ? 'paid' : 'open'}>{isPaid ? 'Paid' : 'Payment due'}</strong>
          </article>
          <article>
            <small>Due date</small>
            <strong>{formatDate(invoice.due_date)}</strong>
          </article>
          <article>
            <small>Total</small>
            <strong>{formatMoney(invoice.total_due)}</strong>
          </article>
        </section>

        <section className="camper-invoice-detail-card">
          <div className="camper-invoice-detail-heading">
            <div>
              <small>ITEMIZED CHARGES</small>
              <h2>{invoice.invoice_type || 'Campground charge'}</h2>
            </div>
            <CalendarDays size={22} />
          </div>

          <div className="camper-invoice-item-list">
            {visibleItemLines.map((line) => (
              <article key={line.key}>
                <div>
                  <strong>{line.title}</strong>
                  <small>{line.explanation}</small>
                </div>
                <span>{formatMoney(line.amount)}</span>
              </article>
            ))}
          </div>

          <div className="camper-invoice-total-box">
            <p><span>Subtotal</span><strong>{formatMoney(subtotal || invoice.subtotal || invoice.total_due)}</strong></p>
            <p><span>Late fee</span><strong>{formatMoney(invoice.late_fee)}</strong></p>
            <p className="grand-total"><span>Total due</span><strong>{formatMoney(invoice.total_due)}</strong></p>
          </div>

          <div className="camper-invoice-detail-actions">
            {isPaid ? (
              <span className="camper-invoice-paid"><CheckCircle2 size={18} /> This invoice is paid</span>
            ) : (
              <button type="button" onClick={payInvoice} disabled={paying}>
                <LockKeyhole size={16} /> {paying ? 'Opening checkout…' : 'Pay this invoice'} <ChevronRight size={16} />
              </button>
            )}
            {message && <p>{message}</p>}
          </div>
        </section>
      </section>
    </main>
  )
}
