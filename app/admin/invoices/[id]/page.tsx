'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, CheckCircle2, CreditCard, FileText, Printer, ReceiptText, Trash2 } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { formatCreditMoney, restoreCreditsForDeletedInvoice } from '../../../../lib/account-credits'
import { calculateCardProcessingFee, cardProcessingFeeSettings, loadPaymentFeeSettings } from '../../../../lib/payment-fees'
import { fallbackInvoiceLine, invoiceLineDetails } from '../../../../lib/invoice-display'
import AdminQuickText from '../../../../components/AdminQuickText'

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [invoice, setInvoice] = useState<any>(null)
  const [invoiceItems, setInvoiceItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [feeSettings, setFeeSettings] = useState(cardProcessingFeeSettings())

  useEffect(() => {
    loadInvoice()
  }, [])

  async function loadInvoice() {
    setLoading(true)
    const invoiceId = String(params.id || '')

    const [invoiceResult, itemResult, paymentFeeSettings] = await Promise.all([
      supabase
        .from('invoices')
        .select(`
          *,
          campers (
            id,
            first_name,
            last_name,
            lot_number
          )
        `)
        .eq('id', invoiceId)
        .single(),
      supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true }),
      loadPaymentFeeSettings(supabase),
    ])

    setFeeSettings(paymentFeeSettings)
    setInvoice(invoiceResult.data || null)
    setInvoiceItems(itemResult.data || [])
    setLoading(false)
  }

  async function deleteInvoice() {
    if (!invoice || !confirm('Delete this invoice permanently? This also removes its itemized charge lines.')) return

    setBusy(true)
    setMessage('')

    let restoreResult = { restoredTotal: 0 }
    try {
      restoreResult = await restoreCreditsForDeletedInvoice(supabase, invoice.id)
    } catch (error: any) {
      setMessage(error.message || 'Unable to restore account credit before deleting this invoice.')
      setBusy(false)
      return
    }

    const { error: reminderError } = await supabase
      .from('text_reminders')
      .delete()
      .eq('invoice_id', invoice.id)

    if (reminderError && !['42P01', 'PGRST205'].includes(reminderError.code || '')) {
      setMessage(reminderError.message)
      setBusy(false)
      return
    }

    const { error: itemError } = await supabase
      .from('invoice_items')
      .delete()
      .eq('invoice_id', invoice.id)

    if (itemError) {
      setMessage(itemError.message)
      setBusy(false)
      return
    }

    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoice.id)

    setBusy(false)

    if (error) {
      setMessage(error.message)
      return
    }

    window.alert(
      restoreResult.restoredTotal > 0
        ? `Invoice deleted. ${formatCreditMoney(restoreResult.restoredTotal)} account credit was returned.`
        : 'Invoice deleted'
    )

    router.push('/admin/invoices')
  }

  async function markPaid() {
    if (!invoice || !confirm('Mark this invoice as paid?')) return

    setBusy(true)
    setMessage('')

    const { error } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: 'Manual office payment',
        payment_reference: 'Marked paid by admin',
      })
      .eq('id', invoice.id)

    setBusy(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Invoice marked paid.')
    loadInvoice()
  }

  const isPaid = invoice?.status === 'paid'
  const cardProcessingFee = calculateCardProcessingFee(Number(invoice?.total_due || 0), feeSettings)
  const cardPayTotal = Number(invoice?.total_due || 0) + cardProcessingFee

  const visibleItemLines = useMemo(() => {
    if (!invoice) return []
    return invoiceItems.length
      ? invoiceItems.map((item) => ({ key: item.id || `${invoice.id}-${item.description}`, raw: item, ...invoiceLineDetails(item) }))
      : [{ key: `${invoice.id}-fallback`, raw: null, ...fallbackInvoiceLine(invoice) }]
  }, [invoice, invoiceItems])

  const itemSubtotal = visibleItemLines.reduce((sum, line) => sum + Number(line.amount || 0), 0)
  const subtotal = Number(invoice?.subtotal ?? itemSubtotal)
  const lateFee = Number(invoice?.late_fee || 0)
  const calculatedTotal = Number((itemSubtotal + lateFee).toFixed(2))
  const invoiceTotal = Number(invoice?.total_due || 0)
  const totalDifference = Number((invoiceTotal - calculatedTotal).toFixed(2))

  if (loading) {
    return (
      <main className="admin-invoice-detail-page">
        <div className="camper-invoice-detail-empty">
          <ReceiptText size={34} />
          <h1>Loading invoice…</h1>
        </div>
      </main>
    )
  }

  if (!invoice) {
    return (
      <main className="admin-invoice-detail-page">
        <div className="camper-invoice-detail-empty">
          <FileText size={34} />
          <h1>Invoice not found</h1>
          <a href="/admin/invoices"><ArrowLeft size={16} /> Back to invoices</a>
        </div>
      </main>
    )
  }

  return (
    <main className="admin-invoice-detail-page">
      <section className="camper-invoice-detail-shell admin-invoice-detail-shell">
        <div className="camper-invoice-detail-hero admin-invoice-detail-hero">
          <div>
            <a href="/admin/invoices"><ArrowLeft size={16} /> Back to invoices</a>
            <span><ReceiptText size={15} /> ADMIN INVOICE DETAIL</span>
            <h1>Invoice #{invoice.invoice_number}</h1>
            <p>
              Lot {invoice.campers?.lot_number || '—'} · {invoice.campers?.first_name || ''} {invoice.campers?.last_name || ''}
            </p>
          </div>
          <div className="admin-invoice-detail-actions">
            {!isPaid && (
              <button type="button" onClick={markPaid} disabled={busy}>
                <CheckCircle2 size={16} /> Mark paid
              </button>
            )}
            <button type="button" onClick={() => window.print()}>
              <Printer size={16} /> Print
            </button>
            <button type="button" className="danger" onClick={deleteInvoice} disabled={busy}>
              <Trash2 size={16} /> Delete
            </button>
          </div>
        </div>

        <div className="camper-invoice-detail-summary">
          <article>
            <small>Invoice balance</small>
            <strong>{formatMoney(invoice.total_due)}</strong>
          </article>
          <article>
            <small>Status</small>
            <strong className={isPaid ? 'paid' : 'open'}>{isPaid ? 'Paid' : 'Payment due'}</strong>
          </article>
          <article>
            <small>Due date</small>
            <strong>{formatDate(invoice.due_date)}</strong>
          </article>
        </div>

        <section className="camper-invoice-detail-card admin-invoice-breakdown-card">
          <div className="camper-invoice-detail-heading">
            <div>
              <small>FULL BREAKDOWN</small>
              <h2>How this invoice total was calculated</h2>
            </div>
            <span className={isPaid ? 'admin-invoice-status paid' : 'admin-invoice-status open'}>
              {isPaid ? 'Paid' : 'Open'}
            </span>
          </div>

          <div className="camper-invoice-item-list">
            {visibleItemLines.map((line) => (
              <article key={line.key}>
                <div>
                  <strong>{line.title}</strong>
                  <small>{line.explanation}</small>
                  {line.raw && (
                    <em>
                      Qty {Number(line.raw.quantity || 1).toLocaleString('en-US')} × {formatMoney(line.raw.unit_price)}
                    </em>
                  )}
                </div>
                <span>{formatMoney(line.amount)}</span>
              </article>
            ))}
          </div>

          {!invoiceItems.length && (
            <div className="camper-invoice-detail-no-items">
              <p>This is an older invoice, so the portal is showing the saved invoice total as one line.</p>
            </div>
          )}

          <div className="camper-invoice-total-box admin-invoice-total-box">
            <p><span>Itemized line subtotal</span><strong>{formatMoney(itemSubtotal)}</strong></p>
            {subtotal !== itemSubtotal && <p><span>Saved invoice subtotal</span><strong>{formatMoney(subtotal)}</strong></p>}
            <p><span>Late fee</span><strong>{formatMoney(lateFee)}</strong></p>
            {Math.abs(totalDifference) >= 0.01 && (
              <p>
                <span>Saved adjustment / older invoice difference</span>
                <strong>{formatMoney(totalDifference)}</strong>
              </p>
            )}
            <p className="grand-total"><span>Invoice balance due</span><strong>{formatMoney(invoice.total_due)}</strong></p>
            {!isPaid && (
              <>
                <p><span>{feeSettings.label} if paid online by card</span><strong>{formatMoney(cardProcessingFee)}</strong></p>
                <p className="grand-total"><span>Total charged by Stripe card checkout</span><strong>{formatMoney(cardPayTotal)}</strong></p>
                <small className="camper-invoice-processing-note">
                  The card fee is only added at online Stripe checkout. Cash, check, and office-posted payments stay at the invoice balance due.
                </small>
              </>
            )}
          </div>

          <div className="admin-invoice-meta-grid">
            <p><CalendarDays size={15} /><span><small>Created</small><strong>{formatDate(invoice.created_at)}</strong></span></p>
            <p><FileText size={15} /><span><small>Type</small><strong>{invoice.invoice_type || 'Campground charge'}</strong></span></p>
            <p><CreditCard size={15} /><span><small>Payment method</small><strong>{invoice.payment_method || (isPaid ? 'Paid' : 'Not paid yet')}</strong></span></p>
          </div>
        </section>

        {invoice?.campers?.id && (
          <AdminQuickText
            camperId={invoice.campers.id}
            title="Text invoice reminder"
            description={`Send a payment reminder to Lot ${invoice.campers?.lot_number || '—'}.`}
            defaultType="Invoice Reminder"
            defaultMessage={`You have invoice #${invoice.invoice_number} due for ${formatMoney(invoice.total_due)}. Please check your Bur Oaks camper portal or contact the office with questions.`}
          />
        )}

        {message && <p className="admin-open-detail-message">{message}</p>}
      </section>
    </main>
  )
}
