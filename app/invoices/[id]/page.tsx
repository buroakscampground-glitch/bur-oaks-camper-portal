'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Hourglass,
  LockKeyhole,
  Printer,
  ReceiptText,
  WalletCards,
} from 'lucide-react'
import { useParams } from 'next/navigation'
import { getCurrentCamper, supabase } from '../../../lib/supabase'
import { checkoutItems, type ExtraPaymentDestination, type InvoicePaymentMethod } from '../../../lib/stripe'
import { fallbackInvoiceLine, invoiceLineDetails } from '../../../lib/invoice-display'
import {
  achProcessingFeeLabel,
  calculateAchProcessingFee,
  calculateCardProcessingFee,
  cardProcessingFeeSettings,
  loadPaymentFeeSettings,
} from '../../../lib/payment-fees'
import { saveSmsConsentPreference } from '../../../lib/sms-consent'
import InvoiceSmsOptInAlert from '../../components/invoice-sms-opt-in-alert'
import { printPageWithFlag } from '../../../lib/print-page'
import { invoiceRecordedTotal, isInvoiceClosed, isInvoicePaid, normalizedInvoiceStatus } from '../../../lib/invoice-balance'
import { achExpectedLabel } from '../../../lib/ach-expected-date'
import type { CamperPaymentReceipt } from '../../../lib/camper-payment-receipt'
import { camperInvoiceStatus } from '../../../lib/camper-invoice-status'
import PaymentReviewDialog from '../../components/payment-review-dialog'

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

function formatPaymentDate(value?: string) {
  if (!value) return 'Recorded as paid'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export default function CamperInvoiceDetailPage() {
  const params = useParams()
  const invoiceId = String(params.id || '')
  const [camper, setCamper] = useState<any>(null)
  const [invoice, setInvoice] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [meterPhoto, setMeterPhoto] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [message, setMessage] = useState('')
  const [feeSettings, setFeeSettings] = useState(cardProcessingFeeSettings())
  const [authorizedFamilyBilling, setAuthorizedFamilyBilling] = useState(false)
  const [receipt, setReceipt] = useState<CamperPaymentReceipt | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<InvoicePaymentMethod>('card')
  const [paymentTotal, setPaymentTotal] = useState('')
  const [extraPaymentDestination, setExtraPaymentDestination] = useState<ExtraPaymentDestination>('lot_rent')
  const [reviewingPayment, setReviewingPayment] = useState(false)
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [smsSaving, setSmsSaving] = useState(false)
  const [smsMessage, setSmsMessage] = useState('')
  const payingRef = useRef(false)

  function printInvoice() {
    printPageWithFlag('data-print-camper-invoice')
  }

  useEffect(() => {
    async function loadInvoice() {
      const camperData = await getCurrentCamper()

      if (!camperData) {
        const returnTo = `/invoices/${invoiceId}`
        window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`
        return
      }

      let visibleCamper = camperData
      setSmsOptIn(Boolean(camperData.sms_opt_in))
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      let data: any = null

      if (token) {
        const response = await fetch(`/api/camper-invoices?invoiceId=${encodeURIComponent(invoiceId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }).catch(() => null)

        if (response?.ok) {
          const result = await response.json()
          data = result.invoice || null
          setReceipt(result.receipt || null)
          visibleCamper = result.camper || camperData
        } else if (response) {
          const result = await response.json().catch(() => null)
          if (response.status !== 404) setMessage(result?.error || 'Unable to load this invoice.')
        }
      }

      if (!data) {
        const directResult = await supabase
          .from('invoices')
          .select('*, invoice_items(*)')
          .eq('id', invoiceId)
          .eq('camper_id', camperData.id)
          .maybeSingle()
        if (directResult.data) {
          data = directResult.data
          setMessage('')
        } else if (directResult.error) {
          setMessage(directResult.error.message)
        }
      }

      if (!data) {
        if (token) {
          const response = await fetch(`/api/authorized-billing?invoiceId=${encodeURIComponent(invoiceId)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null)

          if (response?.ok) {
            const familyResult = await response.json()
            data = familyResult.invoice || null
            setReceipt(familyResult.receipt || null)
            visibleCamper = familyResult.account || camperData
            setAuthorizedFamilyBilling(Boolean(data))
            setMessage('')
          }
        }
      }

      setCamper(visibleCamper)
      const paymentFeeSettings = await loadPaymentFeeSettings(supabase)
      setFeeSettings(paymentFeeSettings)
      setInvoice(data || null)
      setItems(Array.isArray(data?.invoice_items) ? data.invoice_items : [])

      if (data && token) {
        const response = await fetch(`/api/camper-meter-photos?invoiceId=${encodeURIComponent(invoiceId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null)

        if (response?.ok) {
          const result = await response.json()
          setMeterPhoto(Array.isArray(result.photos) ? result.photos[0] || null : null)
        }
      }
      setLoading(false)
    }

    loadInvoice()
  }, [invoiceId])

  useEffect(() => {
    if (!camper?.id) return

    async function refreshInvoiceStatus() {
      if (authorizedFamilyBilling) {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) return
        const response = await fetch(`/api/authorized-billing?invoiceId=${encodeURIComponent(invoiceId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        }).catch(() => null)
        if (!response?.ok) return
        const familyResult = await response.json()
        if (familyResult.invoice) {
          setInvoice(familyResult.invoice)
          setReceipt(familyResult.receipt || null)
          setItems(Array.isArray(familyResult.invoice.invoice_items) ? familyResult.invoice.invoice_items : [])
        }
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) return
      const response = await fetch(`/api/camper-invoices?invoiceId=${encodeURIComponent(invoiceId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }).catch(() => null)
      if (response?.ok) {
        const result = await response.json()
        if (result.invoice) {
          setInvoice(result.invoice)
          setReceipt(result.receipt || null)
          setItems(Array.isArray(result.invoice.invoice_items) ? result.invoice.invoice_items : [])
        }
      }
    }

    const invoiceChannel = supabase
      .channel(`camper-invoice-live-${invoiceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'invoices', filter: `id=eq.${invoiceId}` },
        refreshInvoiceStatus,
      )
      .subscribe()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshInvoiceStatus()
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshInvoiceStatus()
    }, 2 * 60_000)
    window.addEventListener('focus', refreshInvoiceStatus)
    window.addEventListener('pageshow', refreshInvoiceStatus)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshInvoiceStatus)
      window.removeEventListener('pageshow', refreshInvoiceStatus)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      void supabase.removeChannel(invoiceChannel)
    }
  }, [camper?.id, invoiceId, authorizedFamilyBilling])

  async function payInvoice() {
    if (payingRef.current) return
    if (!invoice) return
    if (paymentUnderAmount) {
      setMessage(`This invoice requires ${formatMoney(invoice.total_due)}. Enter at least the amount due.`)
      return
    }

    payingRef.current = true
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
        paymentMethod,
        extraPaymentAmount > 0
          ? { amountCents: Math.round(extraPaymentAmount * 100), destination: extraPaymentDestination }
          : undefined,
      )
    } catch (error: any) {
      setReviewingPayment(false)
      setMessage(error.message || 'Secure checkout could not be opened. Check the invoice status before trying again.')
    } finally {
      payingRef.current = false
      setPaying(false)
    }
  }

  function reviewInvoicePayment() {
    if (paymentUnderAmount) {
      setMessage(`This invoice requires ${formatMoney(invoice.total_due)}. Enter at least the amount due.`)
      return
    }
    setMessage('')
    setReviewingPayment(true)
  }

  async function optInToTexts() {
    setSmsSaving(true)
    setSmsMessage('')

    try {
      const updatedCamper = await saveSmsConsentPreference(true)
      setSmsOptIn(Boolean(updatedCamper.sms_opt_in))
      setSmsMessage('Text alerts are now turned on for every mobile number saved on your household profile.')
    } catch (error: any) {
      setSmsMessage(error.message || 'Unable to turn on text alerts.')
    } finally {
      setSmsSaving(false)
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

  const isPaid = isInvoicePaid(invoice)
  const isProcessing = normalizedInvoiceStatus(invoice) === 'processing'
  const isClosed = isInvoiceClosed(invoice)
  const statusBadge = camperInvoiceStatus(invoice)
  const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0)
  const invoiceBalance = Number(invoice.total_due || 0)
  const recordedTotal = invoiceRecordedTotal(invoice)
  const paidByAccountCredit = /account credit/i.test(String(invoice.payment_method || ''))
  const receiptTotal = receipt?.totalReceived ?? recordedTotal
  const receiptAllocations = receipt?.allocations?.length
    ? receipt.allocations
    : [{ invoiceId: String(invoice.id), invoiceNumber: String(invoice.invoice_number), invoiceType: String(invoice.invoice_type || 'Campground charge'), amount: recordedTotal }]
  const enteredPaymentTotal = Math.min(10_000, Math.max(0, Number(paymentTotal) || 0))
  const paymentUnderAmount = enteredPaymentTotal > 0 && enteredPaymentTotal < invoiceBalance
  const paymentSubtotal = Math.max(invoiceBalance, enteredPaymentTotal || invoiceBalance)
  const extraPaymentAmount = Math.max(0, paymentSubtotal - invoiceBalance)
  const processingFee = paymentMethod === 'card'
    ? calculateCardProcessingFee(paymentSubtotal, feeSettings)
    : calculateAchProcessingFee(paymentSubtotal)
  const payToday = paymentSubtotal + processingFee
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
            {authorizedFamilyBilling && (
              <em className="camper-invoice-family-access">Authorized account · invoice and payment access only</em>
            )}
          </div>
          <button type="button" onClick={printInvoice} aria-label="Print this invoice">
            <Printer size={16} /> Print Invoice
          </button>
        </header>

        <section className="camper-invoice-detail-summary">
          <article>
            <small>Status</small>
            <strong className={statusBadge.className}>
              {statusBadge.label}
            </strong>
            <span>{statusBadge.detail}</span>
          </article>
          <article>
            <small>Due date</small>
            <strong>{formatDate(invoice.due_date)}</strong>
          </article>
          <article>
            <small>{isPaid ? (paidByAccountCredit ? 'Amount credited' : 'Amount paid') : isClosed ? 'Canceled amount — not due' : 'Total due'}</small>
            <strong>{formatMoney(isPaid ? recordedTotal : invoice.total_due)}</strong>
          </article>
        </section>

        <InvoiceSmsOptInAlert
          optedIn={smsOptIn}
          saving={smsSaving}
          message={smsMessage}
          onOptIn={optInToTexts}
        />

        {smsOptIn && smsMessage && (
          <p className="invoice-sms-success" role="status"><CheckCircle2 size={17} /> {smsMessage}</p>
        )}

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

          {meterPhoto && (
            <section style={{ marginTop: '22px', padding: '18px', border: '1px solid #dfe7dc', borderRadius: '16px', background: '#f7faf6' }}>
              <small style={{ display: 'block', marginBottom: '8px', fontWeight: 800, letterSpacing: '.08em' }}>METER PHOTO</small>
              <a href={meterPhoto.photo_url} target="_blank" rel="noreferrer" title="Open the full-size meter photo">
                <img
                  src={meterPhoto.photo_url}
                  alt={`Meter reading for Lot ${meterPhoto.lot_number}`}
                  style={{ display: 'block', width: '100%', maxHeight: '460px', objectFit: 'contain', borderRadius: '12px', background: '#e9efe7' }}
                />
              </a>
              <p style={{ margin: '10px 0 0' }}>
                <strong>Lot {meterPhoto.lot_number}</strong>
                {' · '}{new Date(meterPhoto.captured_at).toLocaleDateString()}
                {meterPhoto.reading !== null ? ` · Reading ${Number(meterPhoto.reading).toLocaleString()}` : ''}
              </p>
            </section>
          )}

          {!isPaid && !isProcessing && !isClosed && (
            <div className="camper-invoice-payment-choice">
              <strong>Choose how to pay</strong>
              <div>
                <button type="button" className={paymentMethod === 'card' ? 'active' : ''} onClick={() => setPaymentMethod('card')}>
                  <CreditCard size={17} /> Card
                </button>
                <button type="button" className={paymentMethod === 'ach' ? 'active' : ''} onClick={() => setPaymentMethod('ach')}>
                  <WalletCards size={17} /> Checking account / ACH
                </button>
              </div>
              <small>
                {paymentMethod === 'ach'
                  ? `Enter your routing and checking-account information securely through Stripe. The ${achProcessingFeeLabel.toLowerCase()} is shown below. ACH payments can take several business days to confirm.`
                  : `Card payments include the ${feeSettings.label.toLowerCase()}.`}
              </small>
            </div>
          )}

          {!isPaid && !isProcessing && !isClosed && (
            <div className="camper-invoice-extra-payment account-extra-payment">
              <div><strong>Pay the bill—or pay more</strong><small>Enter the total amount you want charged. We will identify and protect any remainder.</small></div>
              <label><span>Total payment amount</span><input type="number" min={invoiceBalance} max="10000" step="0.01" inputMode="decimal" value={paymentTotal} onChange={(event) => setPaymentTotal(event.target.value)} placeholder={formatMoney(invoiceBalance)} /></label>
              <label><span>Put any remainder toward</span><select value={extraPaymentDestination} onChange={(event) => setExtraPaymentDestination(event.target.value === 'general' ? 'general' : 'lot_rent')}><option value="lot_rent">Future lot rent only</option><option value="general">Any future bill</option></select></label>
              {extraPaymentAmount > 0 && <p><CheckCircle2 size={15} /><span>Payment covers <strong>{formatMoney(invoiceBalance)}</strong>. The <strong>{formatMoney(extraPaymentAmount)} remainder</strong> will be saved for {extraPaymentDestination === 'lot_rent' ? 'future lot rent only' : 'the next bill that becomes due'}.</span></p>}
              {paymentUnderAmount && <p className="error"><span>This invoice requires <strong>{formatMoney(invoiceBalance)}</strong>. The payment cannot be lower than the amount due.</span></p>}
            </div>
          )}

          <div className="camper-invoice-total-box">
            <p><span>Subtotal</span><strong>{formatMoney(subtotal || invoice.subtotal || invoice.total_due)}</strong></p>
            <p><span>Late fee</span><strong>{formatMoney(invoice.late_fee)}</strong></p>
            <p className="grand-total"><span>{isPaid ? (paidByAccountCredit ? 'Amount satisfied by account credit' : 'Amount paid') : isClosed ? 'Canceled invoice amount — nothing due' : 'Total due'}</span><strong>{formatMoney(isPaid ? recordedTotal : invoice.total_due)}</strong></p>
            {!isPaid && !isProcessing && !isClosed && (
              <>
                <p><span>{paymentMethod === 'ach' ? achProcessingFeeLabel : feeSettings.label}</span><strong>{formatMoney(processingFee)}</strong></p>
                {extraPaymentAmount > 0 && <p><span>Extra payment · {extraPaymentDestination === 'lot_rent' ? 'future lot rent only' : 'any future bill'}</span><strong>{formatMoney(extraPaymentAmount)}</strong></p>}
                <p className="grand-total"><span>{paymentMethod === 'ach' ? 'ACH bank payment' : 'Total charged by card today'}</span><strong>{formatMoney(payToday)}</strong></p>
                <small className="camper-invoice-processing-note">
                  {paymentMethod === 'ach'
                    ? 'The ACH fee is 0.8% with a $5 maximum. Stripe securely handles your routing and account numbers; Bur Oaks does not see or store your full bank-account information.'
                    : 'This fee is only added when you choose online card checkout through Stripe. ACH bank payments do not include this card fee. Bur Oaks does not store your full card number.'}
                </small>
              </>
            )}
          </div>

          {isPaid && (
            <section className="camper-payment-receipt" aria-labelledby="camper-payment-receipt-title">
              <header>
                <span><ReceiptText size={22} /></span>
                <div>
                  <small>PAYMENT RECEIPT</small>
                  <h2 id="camper-payment-receipt-title">{paidByAccountCredit ? 'Account credit applied' : 'Payment recorded'}</h2>
                  <p>This invoice is complete. Nothing else is due on it.</p>
                </div>
              </header>
              <div className="camper-payment-receipt-grid">
                <article><small>{paidByAccountCredit ? 'Amount credited' : receiptAllocations.length > 1 || receipt?.savedCredit ? 'Account payment' : 'Amount received'}</small><strong>{formatMoney(receiptTotal)}</strong></article>
                <article><small>{paidByAccountCredit ? 'Credit applied' : 'Paid on'}</small><strong>{formatPaymentDate(receipt?.receivedOn || invoice.paid_at)}</strong></article>
                <article><small>Method</small><strong>{receipt?.method || invoice.payment_method || 'Payment recorded by Bur Oaks'}</strong></article>
                <article><small>Applied to this invoice</small><strong>{formatMoney(receiptAllocations.find((item) => item.invoiceId === String(invoice.id))?.amount ?? recordedTotal)}</strong></article>
              </div>
              {(receiptAllocations.length > 1 || receipt?.savedCredit) && (
                <section className="camper-payment-allocation" aria-label="How this payment was applied">
                  <h3>How this payment was applied</h3>
                  <div>
                    {receiptAllocations.map((item) => (
                      <a key={item.invoiceId} href={`/invoices/${item.invoiceId}`} aria-current={item.invoiceId === String(invoice.id) ? 'page' : undefined}>
                        <span><strong>Invoice #{item.invoiceNumber}</strong><small>{item.invoiceType}</small></span>
                        <strong>{formatMoney(item.amount)}</strong>
                      </a>
                    ))}
                    {receipt?.savedCredit && (
                      <article>
                        <span><strong>Saved as account credit</strong><small>{receipt.savedCredit.destination === 'lot_rent' ? 'Reserved for future lot rent' : 'Available for a future bill'} · {formatMoney(receipt.savedCredit.remainingAmount)} remaining</small></span>
                        <strong>{formatMoney(receipt.savedCredit.amount)}</strong>
                      </article>
                    )}
                  </div>
                  <p>Each amount is tied to this one payment. Open another invoice above to view its itemized receipt.</p>
                </section>
              )}
              <footer>
                <p><CheckCircle2 size={16} /> Billing &amp; Payments is the source of truth for this receipt.</p>
                <button type="button" onClick={printInvoice}><Printer size={16} /> Print receipt</button>
              </footer>
            </section>
          )}

          {isProcessing && (
            <section className="camper-payment-pending" aria-labelledby="camper-payment-pending-title">
              <Hourglass size={22} />
              <div>
                <small>PAYMENT IN PROGRESS</small>
                <h2 id="camper-payment-pending-title">This is not a receipt yet.</h2>
                <p>{achExpectedLabel(invoice, 'long') || 'Your bank payment is still processing.'} Please do not pay this invoice again. A printable receipt will appear here after the payment is confirmed.</p>
              </div>
            </section>
          )}

          <div className="camper-invoice-detail-actions">
            {isPaid ? (
              <span className="camper-invoice-paid"><CheckCircle2 size={18} /> This invoice is paid</span>
            ) : isProcessing ? (
              <span className="camper-invoice-processing"><Hourglass size={18} /> {achExpectedLabel(invoice, 'long') || 'Bank payment processing'} — please do not pay again</span>
            ) : isClosed ? (
              <span className="camper-invoice-paid"><CheckCircle2 size={18} /> This invoice was canceled. Nothing is owed.</span>
            ) : (
              <button type="button" onClick={reviewInvoicePayment} disabled={paying || paymentUnderAmount}>
                <LockKeyhole size={16} /> {paying ? 'Opening checkout…' : paymentMethod === 'ach' ? `Review and Pay by ACH ${formatMoney(payToday)}` : `Review and Pay by card ${formatMoney(payToday)}`} <ChevronRight size={16} />
              </button>
            )}
            {message && <p role="status" aria-live="polite">{message}</p>}
          </div>
          <PaymentReviewDialog
            open={reviewingPayment}
            paymentMethod={paymentMethod}
            invoiceCount={1}
            invoiceTotal={invoiceBalance}
            extraAmount={extraPaymentAmount}
            extraDestination={extraPaymentDestination}
            processingFee={processingFee}
            chargeTotal={payToday}
            loading={paying}
            onCancel={() => setReviewingPayment(false)}
            onConfirm={payInvoice}
          />
        </section>
      </section>
    </main>
  )
}
