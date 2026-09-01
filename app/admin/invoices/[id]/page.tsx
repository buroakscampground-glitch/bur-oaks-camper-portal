'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, CheckCircle2, CreditCard, FileText, Pencil, Plus, Printer, ReceiptText, Save, Send, Trash2, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { deleteInvoiceWithCreditRestore, formatCreditMoney, updateInvoiceBundle } from '../../../../lib/account-credits'
import { calculateAchProcessingFee, calculateCardProcessingFee, cardProcessingFeeSettings, loadPaymentFeeSettings } from '../../../../lib/payment-fees'
import { fallbackInvoiceLine, invoiceLineDetails } from '../../../../lib/invoice-display'
import AdminQuickText from '../../../../components/AdminQuickText'
import { printPageWithFlag } from '../../../../lib/print-page'

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

type EditableInvoiceItem = {
  key: string
  description: string
  quantity: string
  unitPrice: string
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
  const [appliedCredit, setAppliedCredit] = useState(0)
  const [editing, setEditing] = useState(false)
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('')
  const [editInvoiceType, setEditInvoiceType] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editLateFee, setEditLateFee] = useState('0')
  const [editItems, setEditItems] = useState<EditableInvoiceItem[]>([])
  const [finalPaymentPhone, setFinalPaymentPhone] = useState('')
  const [sendingFinalLink, setSendingFinalLink] = useState(false)

  useEffect(() => {
    loadInvoice()
  }, [])

  useEffect(() => {
    const refreshStatus = () => loadInvoice(false)
    const timer = window.setInterval(refreshStatus, 30_000)

    window.addEventListener('focus', refreshStatus)
    window.addEventListener('pageshow', refreshStatus)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshStatus)
      window.removeEventListener('pageshow', refreshStatus)
    }
  }, [])

  useEffect(() => {
    if (editing && ['paid', 'processing'].includes(String(invoice?.status || '').toLowerCase())) {
      setEditing(false)
      setMessage('Editing closed because this invoice payment status changed.')
    }
  }, [editing, invoice?.status])

  async function loadInvoice(showLoading = true) {
    if (showLoading) setLoading(true)
    const invoiceId = String(params.id || '')

    const [invoiceResult, itemResult, creditResult, paymentFeeSettings] = await Promise.all([
      supabase
        .from('invoices')
        .select(`
          *,
          campers (
            id,
            first_name,
            last_name,
            lot_number,
            phone,
            active
          )
        `)
        .eq('id', invoiceId)
        .single(),
      supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true }),
      supabase
        .from('account_credit_applications')
        .select('amount_applied')
        .eq('invoice_id', invoiceId),
      loadPaymentFeeSettings(supabase),
    ])

    setFeeSettings(paymentFeeSettings)
    setInvoice(invoiceResult.data || null)
    if (!finalPaymentPhone && invoiceResult.data?.campers?.phone) {
      setFinalPaymentPhone(String(invoiceResult.data.campers.phone))
    }
    setInvoiceItems(itemResult.data || [])
    setAppliedCredit(
      (creditResult.data || []).reduce((sum, application) => sum + Number(application.amount_applied || 0), 0)
    )
    if (showLoading) setLoading(false)
  }

  async function deleteInvoice() {
    if (invoice?.status === 'processing') {
      setMessage('This invoice has a payment processing and cannot be deleted.')
      return
    }

    if (!invoice || !confirm('Delete this invoice permanently? This also removes its itemized charge lines.')) return

    setBusy(true)
    setMessage('')

    let restoreResult = { restoredTotal: 0 }
    try {
      restoreResult = await deleteInvoiceWithCreditRestore(supabase, invoice.id)
    } catch (error: any) {
      setMessage(error.message || 'Unable to restore account credit before deleting this invoice.')
      setBusy(false)
      return
    }

    setBusy(false)

    window.alert(
      restoreResult.restoredTotal > 0
        ? `Invoice deleted. ${formatCreditMoney(restoreResult.restoredTotal)} account credit was returned.`
        : 'Invoice deleted'
    )

    router.push('/admin/invoices')
  }

  async function markPaid() {
    if (invoice?.status === 'processing') {
      setMessage('Wait for Stripe to finish this payment before changing its status.')
      return
    }

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

  function beginEditing() {
    if (!invoice || isPaid || isProcessing) return

    setEditInvoiceNumber(String(invoice.invoice_number || ''))
    setEditInvoiceType(String(invoice.invoice_type || 'Campground charge'))
    setEditDueDate(String(invoice.due_date || '').slice(0, 10))
    setEditLateFee(String(Number(invoice.late_fee || 0)))
    setEditItems(
      invoiceItems.length
        ? invoiceItems.map((item) => ({
            key: String(item.id || crypto.randomUUID()),
            description: String(item.description || ''),
            quantity: String(Number(item.quantity || 1)),
            unitPrice: String(Number(item.unit_price || 0)),
          }))
        : [{
            key: crypto.randomUUID(),
            description: String(invoice.invoice_type || 'Campground charge'),
            quantity: '1',
            unitPrice: String(Number(invoice.subtotal ?? invoice.total_due ?? 0)),
          }]
    )
    setMessage('')
    setEditing(true)
  }

  function updateEditItem(key: string, field: keyof Omit<EditableInvoiceItem, 'key'>, value: string) {
    setEditItems((current) => current.map((item) => item.key === key ? { ...item, [field]: value } : item))
  }

  function addEditItem() {
    setEditItems((current) => [
      ...current,
      { key: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '0' },
    ])
  }

  function removeEditItem(key: string) {
    setEditItems((current) => current.length > 1 ? current.filter((item) => item.key !== key) : current)
  }

  async function saveInvoiceEdits() {
    if (!invoice || isPaid || isProcessing) return

    if (!editInvoiceNumber.trim() || !editInvoiceType.trim()) {
      setMessage('Invoice number and invoice type are required.')
      return
    }

    const normalizedItems = editItems.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unit_price: Number(item.unitPrice),
    }))

    if (
      appliedCredit <= 0 &&
      normalizedItems.some((item) => !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unit_price))
    ) {
      setMessage('Every item needs a description, valid quantity, and valid price.')
      return
    }

    setBusy(true)
    setMessage('Saving invoice changes…')

    try {
      const result = await updateInvoiceBundle({
        client: supabase,
        invoiceId: invoice.id,
        invoiceNumber: editInvoiceNumber.trim(),
        invoiceType: editInvoiceType.trim(),
        dueDate: editDueDate || null,
        lateFee: Number(editLateFee || 0),
        items: normalizedItems,
      })

      setEditing(false)
      setMessage(
        result?.amountsLocked
          ? 'Invoice details saved. Amounts stayed locked because account credit was already applied.'
          : 'Invoice changes saved successfully.'
      )
      await loadInvoice(false)
    } catch (error: any) {
      setMessage(error.message || 'Unable to save invoice changes.')
    } finally {
      setBusy(false)
    }
  }

  async function sendFinalPaymentLink() {
    if (!invoice || !finalPaymentPhone.trim()) {
      setMessage('Enter the mobile number that should receive the private payment link.')
      return
    }
    if (!window.confirm(`Text this private ${formatMoney(invoice.total_due)} payment link to ${finalPaymentPhone}?`)) return

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token || ''
    if (!token) {
      window.location.href = '/login'
      return
    }

    setSendingFinalLink(true)
    setMessage('Sending private payment link…')
    try {
      const response = await fetch('/api/admin-final-invoice-text', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, phone: finalPaymentPhone }),
      })
      const result = await response.json()
      if (!response.ok) {
        setMessage(result.error || 'Unable to send the private payment link.')
        return
      }
      setMessage(result.skipped ? result.message : `Private payment link sent to ${result.phone}.`)
    } catch (error: any) {
      setMessage(error.message || 'Unable to send the private payment link.')
    } finally {
      setSendingFinalLink(false)
    }
  }

  const isPaid = invoice?.status === 'paid'
  const isProcessing = invoice?.status === 'processing'
  const cardProcessingFee = calculateCardProcessingFee(Number(invoice?.total_due || 0), feeSettings)
  const cardPayTotal = Number(invoice?.total_due || 0) + cardProcessingFee
  const achProcessingFee = calculateAchProcessingFee(Number(invoice?.total_due || 0))
  const achPayTotal = Number(invoice?.total_due || 0) + achProcessingFee

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
  const editSubtotal = editItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0
  )
  const editTotal = editSubtotal + Number(editLateFee || 0)

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
            {!isPaid && !isProcessing && !editing && (
              <button type="button" onClick={beginEditing} disabled={busy}>
                <Pencil size={16} /> Edit invoice
              </button>
            )}
            {!isPaid && !isProcessing && !editing && (
              <button type="button" onClick={markPaid} disabled={busy}>
                <CheckCircle2 size={16} /> Mark paid
              </button>
            )}
            <button type="button" onClick={() => printPageWithFlag('data-print-camper-invoice')} aria-label="Print this invoice">
              <Printer size={16} /> Print Invoice
            </button>
            <button type="button" className="danger" onClick={deleteInvoice} disabled={busy || isProcessing || editing}>
              <Trash2 size={16} /> {isProcessing ? 'Payment locked' : 'Delete'}
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
            <strong className={isPaid ? 'paid' : isProcessing ? 'processing' : 'open'}>
              {isPaid ? 'Paid' : isProcessing ? 'Bank payment processing' : 'Payment due'}
            </strong>
          </article>
          <article>
            <small>Due date</small>
            <strong>{formatDate(invoice.due_date)}</strong>
          </article>
        </div>

        {editing && (
          <section className="admin-invoice-editor">
            <div className="admin-invoice-editor-heading">
              <div>
                <small>EDIT OPEN INVOICE</small>
                <h2>Correct invoice details</h2>
                <p>Changes appear on the camper’s invoice after you save.</p>
              </div>
              <button type="button" onClick={() => setEditing(false)} disabled={busy}><X size={16} /> Cancel</button>
            </div>

            <div className="admin-invoice-editor-grid">
              <label><span>Invoice number</span><input value={editInvoiceNumber} onChange={(event) => setEditInvoiceNumber(event.target.value)} /></label>
              <label><span>Invoice type</span><input value={editInvoiceType} onChange={(event) => setEditInvoiceType(event.target.value)} /></label>
              <label><span>Due date</span><input type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} /></label>
              <label><span>Late fee</span><input type="number" min="0" step="0.01" value={editLateFee} onChange={(event) => setEditLateFee(event.target.value)} disabled={appliedCredit > 0} /></label>
            </div>

            {appliedCredit > 0 ? (
              <div className="admin-invoice-editor-lock">
                <CreditCard size={18} />
                <span><strong>Amounts are protected</strong><small>{formatMoney(appliedCredit)} in account credit was already applied. You can edit the invoice number, type, and due date, but not its charges.</small></span>
              </div>
            ) : (
              <div className="admin-invoice-editor-items">
                <div><strong>Itemized charges</strong><button type="button" onClick={addEditItem}><Plus size={15} /> Add charge</button></div>
                {editItems.map((item) => (
                  <article key={item.key}>
                    <label><span>Description</span><input value={item.description} onChange={(event) => updateEditItem(item.key, 'description', event.target.value)} /></label>
                    <label><span>Quantity</span><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateEditItem(item.key, 'quantity', event.target.value)} /></label>
                    <label><span>Price each</span><input type="number" step="0.01" value={item.unitPrice} onChange={(event) => updateEditItem(item.key, 'unitPrice', event.target.value)} /></label>
                    <strong>{formatMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</strong>
                    <button type="button" className="danger" onClick={() => removeEditItem(item.key)} disabled={editItems.length === 1} aria-label={`Remove ${item.description || 'invoice item'}`}><Trash2 size={15} /></button>
                  </article>
                ))}
              </div>
            )}

            <div className="admin-invoice-editor-footer">
              <span><small>Updated invoice total</small><strong>{appliedCredit > 0 ? formatMoney(invoice.total_due) : formatMoney(editTotal)}</strong></span>
              <button type="button" onClick={saveInvoiceEdits} disabled={busy}><Save size={16} /> {busy ? 'Saving…' : 'Save invoice changes'}</button>
            </div>
          </section>
        )}

        <section className="camper-invoice-detail-card admin-invoice-breakdown-card">
          <div className="camper-invoice-detail-heading">
            <div>
              <small>FULL BREAKDOWN</small>
              <h2>How this invoice total was calculated</h2>
            </div>
            <span className={isPaid ? 'admin-invoice-status paid' : isProcessing ? 'admin-invoice-status processing' : 'admin-invoice-status open'}>
              {isPaid ? 'Paid' : isProcessing ? 'Processing' : 'Open'}
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
                <p><span>ACH processing fee if paid from a checking account</span><strong>{formatMoney(achProcessingFee)}</strong></p>
                <p className="grand-total"><span>Total charged by Stripe checking/ACH</span><strong>{formatMoney(achPayTotal)}</strong></p>
                <small className="camper-invoice-processing-note">
                  Online card and checking/ACH fees are shown separately. Cash, paper checks, and office-posted payments stay at the invoice balance due.
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

        {invoice?.campers?.active === false && !isPaid && !isProcessing && (
          <section className="admin-quick-text">
            <div className="admin-quick-text-heading">
              <span><CreditCard size={18} /></span>
              <div>
                <small>FINAL BILLING</small>
                <h2>Text a private payment link</h2>
                <p>This opens only this invoice. It does not restore camper-portal access and closes after online or manually recorded payment.</p>
              </div>
            </div>
            <label>
              <span>Mobile number</span>
              <input type="tel" value={finalPaymentPhone} onChange={(event) => setFinalPaymentPhone(event.target.value)} placeholder="(618) 555-1234" />
            </label>
            <button type="button" onClick={sendFinalPaymentLink} disabled={sendingFinalLink}>
              <Send size={16} /> {sendingFinalLink ? 'Sending…' : 'Send private payment link'}
            </button>
          </section>
        )}

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
