'use client'

import { useEffect, useState } from 'react'
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
import { checkoutItems, type InvoicePaymentMethod } from '../../../lib/stripe'
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
  const [meterPhoto, setMeterPhoto] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [message, setMessage] = useState('')
  const [feeSettings, setFeeSettings] = useState(cardProcessingFeeSettings())
  const [authorizedFamilyBilling, setAuthorizedFamilyBilling] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<InvoicePaymentMethod>('card')
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [smsSaving, setSmsSaving] = useState(false)
  const [smsMessage, setSmsMessage] = useState('')

  function printInvoice() {
    const cleanup = () => {
      delete document.body.dataset.printCamperInvoice
      window.removeEventListener('afterprint', cleanup)
    }
    document.body.dataset.printCamperInvoice = 'true'
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  useEffect(() => {
    async function loadInvoice() {
      const camperData = await getCurrentCamper()

      if (!camperData) {
        window.location.href = '/login'
        return
      }

      let visibleCamper = camperData
      setSmsOptIn(Boolean(camperData.sms_opt_in))
      let { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('id', invoiceId)
        .eq('camper_id', camperData.id)
        .maybeSingle()

      if (error) setMessage(error.message)

      if (!data) {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (token) {
          const response = await fetch(`/api/authorized-billing?invoiceId=${encodeURIComponent(invoiceId)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null)

          if (response?.ok) {
            const familyResult = await response.json()
            data = familyResult.invoice || null
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

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
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
        }).catch(() => null)
        if (!response?.ok) return
        const familyResult = await response.json()
        if (familyResult.invoice) {
          setInvoice(familyResult.invoice)
          setItems(Array.isArray(familyResult.invoice.invoice_items) ? familyResult.invoice.invoice_items : [])
        }
        return
      }

      const { data } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('id', invoiceId)
        .eq('camper_id', camper.id)
        .maybeSingle()

      if (data) {
        setInvoice(data)
        setItems(Array.isArray(data.invoice_items) ? data.invoice_items : [])
      }
    }

    const timer = window.setInterval(refreshInvoiceStatus, 30_000)
    window.addEventListener('focus', refreshInvoiceStatus)
    window.addEventListener('pageshow', refreshInvoiceStatus)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshInvoiceStatus)
      window.removeEventListener('pageshow', refreshInvoiceStatus)
    }
  }, [camper?.id, invoiceId, authorizedFamilyBilling])

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
        paymentMethod,
      )
    } catch (error: any) {
      setMessage(error.message || 'Unable to start secure checkout.')
      setPaying(false)
    }
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

  const isPaid = invoice.status === 'paid'
  const isProcessing = invoice.status === 'processing'
  const subtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0)
  const processingFee = paymentMethod === 'card'
    ? calculateCardProcessingFee(Number(invoice.total_due || 0), feeSettings)
    : calculateAchProcessingFee(Number(invoice.total_due || 0))
  const payToday = Number(invoice.total_due || 0) + processingFee
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
            <strong className={isPaid ? 'paid' : isProcessing ? 'processing' : 'open'}>
              {isPaid ? 'Paid' : isProcessing ? 'Bank payment processing' : 'Payment due'}
            </strong>
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

          {!isPaid && !isProcessing && (
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

          <div className="camper-invoice-total-box">
            <p><span>Subtotal</span><strong>{formatMoney(subtotal || invoice.subtotal || invoice.total_due)}</strong></p>
            <p><span>Late fee</span><strong>{formatMoney(invoice.late_fee)}</strong></p>
            <p className="grand-total"><span>Total due</span><strong>{formatMoney(invoice.total_due)}</strong></p>
            {!isPaid && !isProcessing && (
              <>
                <p><span>{paymentMethod === 'ach' ? achProcessingFeeLabel : feeSettings.label}</span><strong>{formatMoney(processingFee)}</strong></p>
                <p className="grand-total"><span>{paymentMethod === 'ach' ? 'ACH bank payment' : 'Total charged by card today'}</span><strong>{formatMoney(payToday)}</strong></p>
                <small className="camper-invoice-processing-note">
                  {paymentMethod === 'ach'
                    ? 'The ACH fee is 0.8% with a $5 maximum. Stripe securely handles your routing and account numbers; Bur Oaks does not see or store your full bank-account information.'
                    : 'This fee is only added when you choose online card checkout through Stripe. ACH bank payments do not include this card fee. Bur Oaks does not store your full card number.'}
                </small>
              </>
            )}
          </div>

          <div className="camper-invoice-detail-actions">
            {isPaid ? (
              <span className="camper-invoice-paid"><CheckCircle2 size={18} /> This invoice is paid</span>
            ) : isProcessing ? (
              <span className="camper-invoice-processing"><Hourglass size={18} /> Bank payment processing — please do not pay again</span>
            ) : (
              <button type="button" onClick={payInvoice} disabled={paying}>
                <LockKeyhole size={16} /> {paying ? 'Opening checkout…' : `${paymentMethod === 'ach' ? 'Pay by ACH' : 'Pay by card'} ${formatMoney(payToday)}`} <ChevronRight size={16} />
              </button>
            )}
            {message && <p>{message}</p>}
          </div>
        </section>
      </section>
    </main>
  )
}
